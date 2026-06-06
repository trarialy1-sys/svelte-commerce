import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Org-level application roles (Chunk 0.2).
 *
 * The full 4-role model becomes DB-backed in Chunk 0.3 **behind this same
 * interface** — call sites use these names and never change. For now we map
 * Clerk's coarse `org:admin` / `org:member` onto them:
 *   - `org:admin`  → satisfies `owner` and `admin`
 *   - `org:member` → satisfies `operator` and `viewer`
 */
export type AppRole = "owner" | "admin" | "operator" | "viewer";

// Ascending privilege. Index = rank.
const ROLE_ORDER: readonly AppRole[] = ["viewer", "operator", "admin", "owner"];

function roleRank(role: AppRole): number {
  return ROLE_ORDER.indexOf(role);
}

/**
 * Coarse stand-in mapping for this chunk. Chunk 0.3 swaps the internals to the
 * DB role with no call-site changes.
 */
function effectiveAppRole(clerkOrgRole: string | null | undefined): AppRole | null {
  if (!clerkOrgRole) return null;
  if (clerkOrgRole === "org:admin") return "owner"; // top tier
  return "operator"; // org:member (and any other member-tier role)
}

export interface AuthContext {
  userId: string | null;
  orgId: string | null;
  /** Raw Clerk org role, e.g. "org:admin" | "org:member". */
  orgRole: string | null;
  /** Mapped application role for the active org, or null if no active org. */
  appRole: AppRole | null;
  isPlatformAdmin: boolean;
}

/** True if `userId` is in the PLATFORM_ADMIN_USER_IDS env allowlist (you). */
export function isPlatformAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = (process.env.PLATFORM_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

/** Non-throwing read of the current auth state. Safe to call anywhere. */
export async function getAuthContext(): Promise<AuthContext> {
  const { userId, orgId, orgRole } = await auth();
  return {
    userId: userId ?? null,
    orgId: orgId ?? null,
    orgRole: orgRole ?? null,
    appRole: effectiveAppRole(orgRole),
    isPlatformAdmin: isPlatformAdmin(userId),
  };
}

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
 * Require at least role `min` in the active org. Authoritative server-side
 * check — do not rely on the proxy alone.
 */
export async function requireOrgRole(min: AppRole): Promise<AuthContext> {
  const ctx = await requireOrg();
  if (!ctx.appRole || roleRank(ctx.appRole) < roleRank(min)) {
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

/** Best-effort fetch of the active org's display name (falls back to id). */
export async function getActiveOrgName(orgId: string): Promise<string> {
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({
      organizationId: orgId,
    });
    return org.name;
  } catch {
    return orgId;
  }
}
