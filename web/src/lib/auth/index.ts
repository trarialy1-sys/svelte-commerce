import { cache } from "react";
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/client";
import { db, withOrg } from "@/lib/db";
import { ROLE_RANK, meetsOrgRole, type AppRole } from "./roles";

/**
 * Org-level application roles. Same names/signature as Chunk 0.2 — call sites
 * (e.g. `requireOrgRole('admin')`) are unchanged. As of Chunk 0.3 the role is
 * read from the DB `Membership` table (owner/admin/operator/viewer).
 */
export { meetsOrgRole };
export type { AppRole };

function dbRoleToAppRole(role: Role): AppRole {
  return role.toLowerCase() as AppRole;
}

/** Default DB role when JIT-creating a membership from the Clerk org role. */
function defaultRoleFromClerk(clerkOrgRole: string | null | undefined): Role {
  return clerkOrgRole === "org:admin" ? Role.ADMIN : Role.OPERATOR;
}

export function isPlatformAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = (process.env.PLATFORM_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

export interface AuthContext {
  userId: string | null;
  orgId: string | null;
  /** Raw Clerk org role, e.g. "org:admin" | "org:member". */
  orgRole: string | null;
  /** DB-backed application role for the active org, or null if none. */
  appRole: AppRole | null;
  isPlatformAdmin: boolean;
}

/** Upsert the current Clerk user into the DB (non-tenant table). */
async function ensureUser(userId: string): Promise<void> {
  const u = await currentUser();
  const email =
    u?.primaryEmailAddress?.emailAddress ??
    u?.emailAddresses?.[0]?.emailAddress ??
    `${userId}@placeholder.local`;
  const name =
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.username || null;
  await db.user.upsert({
    where: { id: userId },
    create: { id: userId, email, name, avatarUrl: u?.imageUrl ?? null },
    update: { email, name, avatarUrl: u?.imageUrl ?? null },
  });
}

/** Upsert the active Clerk org into the DB (non-tenant table). */
async function ensureOrg(orgId: string): Promise<void> {
  let name = orgId;
  let slug: string | null = null;
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({
      organizationId: orgId,
    });
    name = org.name;
    slug = org.slug ?? null;
  } catch {
    // best-effort; keep id as name
  }
  await db.organization.upsert({
    where: { id: orgId },
    create: { id: orgId, name, slug },
    update: { name, ...(slug ? { slug } : {}) },
  });
}

/** Read the DB membership role for (orgId, userId), RLS-scoped. */
async function readMembershipRole(
  orgId: string,
  userId: string
): Promise<Role | null> {
  const m = await withOrg(orgId, (tx) =>
    tx.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true },
    })
  );
  return m?.role ?? null;
}

/**
 * JIT fallback: ensure User/Organization/Membership exist for the current
 * session (keeps local dev and pre-webhook states working). Returns the
 * resulting DB role. On create the role is mapped from Clerk; an existing
 * differing role is never downgraded.
 */
async function jitProvision(
  userId: string,
  orgId: string,
  clerkOrgRole: string | null | undefined
): Promise<Role> {
  await ensureUser(userId);
  await ensureOrg(orgId);
  const role = await withOrg(orgId, async (tx) => {
    const created = await tx.membership.upsert({
      where: { orgId_userId: { orgId, userId } },
      create: { orgId, userId, role: defaultRoleFromClerk(clerkOrgRole) },
      update: {}, // never downgrade an existing role
      select: { role: true },
    });
    return created.role;
  });
  return role;
}

/**
 * Non-throwing read of the current auth state, backed by the DB role.
 * Memoized per request via React `cache`.
 */
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    return {
      userId: null,
      orgId: null,
      orgRole: null,
      appRole: null,
      isPlatformAdmin: false,
    };
  }

  const platformAdmin = isPlatformAdmin(userId);

  if (!orgId) {
    await ensureUser(userId);
    return {
      userId,
      orgId: null,
      orgRole: orgRole ?? null,
      appRole: null,
      isPlatformAdmin: platformAdmin,
    };
  }

  let role = await readMembershipRole(orgId, userId);
  if (!role) {
    role = await jitProvision(userId, orgId, orgRole);
  }

  return {
    userId,
    orgId,
    orgRole: orgRole ?? null,
    appRole: dbRoleToAppRole(role),
    isPlatformAdmin: platformAdmin,
  };
});

/** Require an authenticated user; otherwise redirect to sign-in. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.userId) redirect("/sign-in");
  return ctx;
}

/** Require an active organization; otherwise send to the "select org" state ("/"). */
export async function requireOrg(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.orgId) redirect("/");
  return ctx;
}

/**
 * Require at least role `min` in the active org (DB-backed). Authoritative
 * server-side check — same exported signature as Chunk 0.2.
 */
export async function requireOrgRole(min: AppRole): Promise<AuthContext> {
  const ctx = await requireOrg();
  if (!ctx.appRole || ROLE_RANK[ctx.appRole] < ROLE_RANK[min]) {
    redirect("/");
  }
  return ctx;
}

/** Require platform super-admin (env allowlist); otherwise deny. */
export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.isPlatformAdmin) redirect("/");
  return ctx;
}

/** Display name for the active org (DB first, then id). */
export async function getActiveOrgName(orgId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  return org?.name ?? orgId;
}
