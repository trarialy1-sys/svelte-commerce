"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function audit(
  orgId: string,
  actorUserId: string | null | undefined,
  action: string,
  entityId: string,
  meta: Prisma.InputJsonObject
): Promise<void> {
  await getOrgDb(orgId).auditLog.create({
    data: { orgId, actorUserId: actorUserId ?? null, action, entity: "Customer", entityId, meta },
  });
}

/** All CRM mutations are operator+. Returns the resolved ctx. */
async function guard() {
  const { orgId, userId } = await requireOrgRole("operator");
  return { orgId: orgId!, userId };
}

export async function addNoteAction(input: {
  customerId: string;
  body: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const body = input.body?.trim();
  if (!body) return { ok: false, message: "La note est vide." };

  await getOrgDb(orgId).customerNote.create({
    data: { orgId, customerId: input.customerId, body, authorId: userId },
  });
  await audit(orgId, userId, "customer.note_added", input.customerId, {});
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
}

export async function updateContactAction(input: {
  customerId: string;
  name: string;
  city: string | null;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const name = input.name?.trim();
  if (!name) return { ok: false, message: "Le nom est requis." };
  const city = input.city?.trim() || null;

  await getOrgDb(orgId).customer.update({
    where: { id: input.customerId },
    data: { name, city },
  });
  await audit(orgId, userId, "customer.updated", input.customerId, { name, city });
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
}

async function setTags(orgId: string, customerId: string, tags: string[]) {
  await getOrgDb(orgId).customer.update({
    where: { id: customerId },
    data: { tags },
  });
}

export async function addTagAction(input: {
  customerId: string;
  tag: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const tag = input.tag?.trim().toLowerCase();
  if (!tag) return { ok: false, message: "Tag vide." };

  const c = await getOrgDb(orgId).customer.findUnique({
    where: { id: input.customerId },
    select: { tags: true },
  });
  if (!c) return { ok: false, message: "Client introuvable." };
  if (c.tags.includes(tag)) return { ok: true };

  await setTags(orgId, input.customerId, [...c.tags, tag]);
  await audit(orgId, userId, "customer.tag_added", input.customerId, { tag });
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
}

export async function removeTagAction(input: {
  customerId: string;
  tag: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const c = await getOrgDb(orgId).customer.findUnique({
    where: { id: input.customerId },
    select: { tags: true },
  });
  if (!c) return { ok: false, message: "Client introuvable." };

  await setTags(
    orgId,
    input.customerId,
    c.tags.filter((t) => t !== input.tag)
  );
  await audit(orgId, userId, "customer.tag_removed", input.customerId, { tag: input.tag });
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
}

export async function setBlockedAction(input: {
  customerId: string;
  blocked: boolean;
  reason?: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const reason = input.blocked ? input.reason?.trim() || null : null;

  await getOrgDb(orgId).customer.update({
    where: { id: input.customerId },
    data: { isBlocked: input.blocked, blockedReason: reason },
  });
  await audit(
    orgId,
    userId,
    input.blocked ? "customer.blocked" : "customer.unblocked",
    input.customerId,
    reason ? { reason } : {}
  );
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
}
