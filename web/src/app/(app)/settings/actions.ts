"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";

import { Prisma, Role } from "@/generated/prisma/client";
import { db, getOrgDb } from "@/lib/db";
import { requireOrgRole, type AppRole } from "@/lib/auth";
import { refreshCityCatalog } from "@/lib/shipping/cities";
import {
  CURRENCY_VALUES,
  LOCALE_VALUES,
  TIMEZONE_VALUES,
} from "@/lib/org/options";
import {
  appRoleToClerk,
  checkInvite,
  checkRemove,
  checkRoleChange,
} from "@/lib/team/manage";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/** Write an org-scoped audit row. */
async function audit(
  orgId: string,
  actorUserId: string | null | undefined,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Prisma.InputJsonObject
): Promise<void> {
  await getOrgDb(orgId).auditLog.create({
    data: { orgId, actorUserId: actorUserId ?? null, action, entity, entityId, meta },
  });
}

// ── Organization ───────────────────────────────────────────────────────────

export async function updateOrganizationAction(input: {
  name: string;
  logoUrl?: string | null;
  locale: string;
  timezone: string;
  currency: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await requireOrgRole("admin");
  const id = orgId!;

  const name = input.name?.trim();
  if (!name) return { ok: false, message: "Le nom est requis." };
  if (!LOCALE_VALUES.includes(input.locale))
    return { ok: false, message: "Langue invalide." };
  if (!TIMEZONE_VALUES.includes(input.timezone))
    return { ok: false, message: "Fuseau horaire invalide." };
  if (!CURRENCY_VALUES.includes(input.currency))
    return { ok: false, message: "Devise invalide." };
  const logoUrl = input.logoUrl?.trim() || null;

  // Keep the Clerk org name in sync (best-effort; DB is the source of truth here).
  try {
    const c = await clerkClient();
    await c.organizations.updateOrganization(id, { name });
  } catch (e) {
    console.error("[settings] clerk updateOrganization failed", e);
  }

  await db.organization.update({
    where: { id },
    data: { name, logoUrl, locale: input.locale, timezone: input.timezone, currency: input.currency },
  });

  await audit(id, userId, "org.updated", "Organization", id, {
    name,
    locale: input.locale,
    timezone: input.timezone,
    currency: input.currency,
  });

  revalidatePath("/settings/organization");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ── Team ─────────────────────────────────────────────────────────────────────

export async function inviteMemberAction(input: {
  email: string;
  role: AppRole;
}): Promise<ActionResult> {
  const { orgId, userId, appRole } = await requireOrgRole("admin");
  const id = orgId!;
  const email = input.email?.trim().toLowerCase();
  if (!email || !email.includes("@"))
    return { ok: false, message: "Adresse e-mail invalide." };

  const guard = checkInvite(appRole, input.role);
  if (!guard.ok) return { ok: false, message: guard.reason };

  try {
    const c = await clerkClient();
    await c.organizations.createOrganizationInvitation({
      organizationId: id,
      emailAddress: email,
      role: appRoleToClerk(input.role),
      inviterUserId: userId ?? undefined,
      // Carry the fine role; the webhook applies it on accept (coarse fallback).
      publicMetadata: { appRole: input.role },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Échec de l'invitation.";
    return { ok: false, message: msg };
  }

  await audit(id, userId, "team.member_invited", "Membership", null, {
    email,
    role: input.role,
  });
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function changeMemberRoleAction(input: {
  targetUserId: string;
  role: AppRole;
}): Promise<ActionResult> {
  const { orgId, userId, appRole } = await requireOrgRole("admin");
  const id = orgId!;
  const odb = getOrgDb(id);

  const target = await odb.membership.findUnique({
    where: { orgId_userId: { orgId: id, userId: input.targetUserId } },
    select: { role: true },
  });
  if (!target) return { ok: false, message: "Membre introuvable." };

  const ownerCount = await odb.membership.count({ where: { role: Role.OWNER } });
  const guard = checkRoleChange({
    callerRole: appRole,
    targetCurrentRole: target.role.toLowerCase() as AppRole,
    newRole: input.role,
    ownerCount,
  });
  if (!guard.ok) return { ok: false, message: guard.reason };

  await odb.membership.update({
    where: { orgId_userId: { orgId: id, userId: input.targetUserId } },
    data: { role: input.role.toUpperCase() as Role },
  });

  // Align Clerk's coarse role so middleware checks stay consistent.
  try {
    const c = await clerkClient();
    await c.organizations.updateOrganizationMembership({
      organizationId: id,
      userId: input.targetUserId,
      role: appRoleToClerk(input.role),
    });
  } catch (e) {
    console.error("[settings] clerk updateOrganizationMembership failed", e);
  }

  await audit(id, userId, "team.role_changed", "Membership", input.targetUserId, {
    from: target.role,
    to: input.role.toUpperCase(),
  });
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function removeMemberAction(input: {
  targetUserId: string;
}): Promise<ActionResult> {
  const { orgId, userId, appRole } = await requireOrgRole("admin");
  const id = orgId!;
  const odb = getOrgDb(id);

  const target = await odb.membership.findUnique({
    where: { orgId_userId: { orgId: id, userId: input.targetUserId } },
    select: { role: true },
  });
  if (!target) return { ok: false, message: "Membre introuvable." };

  const ownerCount = await odb.membership.count({ where: { role: Role.OWNER } });
  const guard = checkRemove({
    callerRole: appRole,
    targetRole: target.role.toLowerCase() as AppRole,
    ownerCount,
  });
  if (!guard.ok) return { ok: false, message: guard.reason };

  // Revoke the Clerk membership; the webhook will also fire, but we mirror in DB now.
  try {
    const c = await clerkClient();
    await c.organizations.deleteOrganizationMembership({
      organizationId: id,
      userId: input.targetUserId,
    });
  } catch (e) {
    console.error("[settings] clerk deleteOrganizationMembership failed", e);
  }

  await odb.membership.deleteMany({ where: { userId: input.targetUserId } });

  await audit(id, userId, "team.member_removed", "Membership", input.targetUserId, {
    role: target.role,
  });
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function revokeInviteAction(input: {
  invitationId: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await requireOrgRole("admin");
  const id = orgId!;
  try {
    const c = await clerkClient();
    await c.organizations.revokeOrganizationInvitation({
      organizationId: id,
      invitationId: input.invitationId,
      requestingUserId: userId ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Échec de la révocation.";
    return { ok: false, message: msg };
  }
  await audit(id, userId, "team.invite_revoked", "Membership", input.invitationId, {});
  revalidatePath("/settings/team");
  return { ok: true };
}

/** Load/refresh the global OzonExpress city catalog. Admin-only, audited. */
export async function refreshCityCatalogAction(): Promise<{
  ok: boolean;
  count?: number;
  message?: string;
}> {
  const { orgId, userId } = await requireOrgRole("admin");
  try {
    const { count } = await refreshCityCatalog();
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: "shipping.cities_refreshed",
        entity: "CityCatalog",
        meta: { count },
      },
    });
    revalidatePath("/settings");
    revalidatePath("/shipping");
    return { ok: true, count };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}
