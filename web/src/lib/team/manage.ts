import type { AppRole } from "@/lib/auth/roles";

/** Clerk's coarse org role. We keep it aligned so middleware checks hold. */
export type ClerkOrgRole = "org:admin" | "org:member";

/**
 * Map our 4 DB roles onto Clerk's coarse pair. owner/admin → org:admin so they
 * keep Clerk-side admin powers; operator/viewer → org:member.
 */
export function appRoleToClerk(role: AppRole): ClerkOrgRole {
  return role === "owner" || role === "admin" ? "org:admin" : "org:member";
}

/** Reverse map (used by the webhook as a fallback when no fine role is known). */
export function clerkRoleToApp(role: string): AppRole {
  return role === "org:admin" ? "admin" : "operator";
}

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Propriétaire",
  admin: "Admin",
  operator: "Opérateur",
  viewer: "Observateur",
};

export const ALL_ROLES: AppRole[] = ["owner", "admin", "operator", "viewer"];

/** Roles an `admin` (not owner) is allowed to assign / manage. */
const ADMIN_MANAGEABLE: AppRole[] = ["operator", "viewer"];

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

const OK: GuardResult = { ok: true };

/** Roles the caller may pick when inviting / changing a role. */
export function assignableRoles(callerRole: AppRole | null): AppRole[] {
  if (callerRole === "owner") return ["admin", "operator", "viewer", "owner"];
  if (callerRole === "admin") return ["operator", "viewer"];
  return [];
}

/** Validate an invitation by the caller. */
export function checkInvite(
  callerRole: AppRole | null,
  role: AppRole
): GuardResult {
  if (role === "owner" && callerRole !== "owner") {
    return { ok: false, reason: "Seul un propriétaire peut inviter un propriétaire." };
  }
  if (callerRole === "admin" && !ADMIN_MANAGEABLE.includes(role)) {
    return { ok: false, reason: "Un admin ne peut inviter qu'un opérateur ou un observateur." };
  }
  if (callerRole !== "owner" && callerRole !== "admin") {
    return { ok: false, reason: "Action réservée aux administrateurs." };
  }
  return OK;
}

/** Validate a role change. */
export function checkRoleChange(p: {
  callerRole: AppRole | null;
  targetCurrentRole: AppRole;
  newRole: AppRole;
  ownerCount: number;
}): GuardResult {
  const { callerRole, targetCurrentRole, newRole, ownerCount } = p;

  // Only owner/admin can manage anyone.
  if (callerRole !== "owner" && callerRole !== "admin") {
    return { ok: false, reason: "Action réservée aux administrateurs." };
  }
  // Granting or revoking owner is owner-only.
  if ((newRole === "owner" || targetCurrentRole === "owner") && callerRole !== "owner") {
    return { ok: false, reason: "Seul un propriétaire peut gérer le rôle propriétaire." };
  }
  // Admins may only touch operators/viewers, in both directions.
  if (callerRole === "admin") {
    if (!ADMIN_MANAGEABLE.includes(targetCurrentRole) || !ADMIN_MANAGEABLE.includes(newRole)) {
      return { ok: false, reason: "Un admin ne peut gérer que les opérateurs et observateurs." };
    }
  }
  // Never demote the last owner.
  if (targetCurrentRole === "owner" && newRole !== "owner" && ownerCount <= 1) {
    return { ok: false, reason: "Impossible de rétrograder le dernier propriétaire." };
  }
  if (newRole === targetCurrentRole) {
    return { ok: false, reason: "Le rôle est déjà appliqué." };
  }
  return OK;
}

/** Validate a member removal. */
export function checkRemove(p: {
  callerRole: AppRole | null;
  targetRole: AppRole;
  ownerCount: number;
}): GuardResult {
  const { callerRole, targetRole, ownerCount } = p;
  if (callerRole !== "owner" && callerRole !== "admin") {
    return { ok: false, reason: "Action réservée aux administrateurs." };
  }
  if (targetRole === "owner" && callerRole !== "owner") {
    return { ok: false, reason: "Seul un propriétaire peut retirer un propriétaire." };
  }
  if (callerRole === "admin" && !ADMIN_MANAGEABLE.includes(targetRole)) {
    return { ok: false, reason: "Un admin ne peut retirer que les opérateurs et observateurs." };
  }
  // Never remove the last owner.
  if (targetRole === "owner" && ownerCount <= 1) {
    return { ok: false, reason: "Impossible de retirer le dernier propriétaire." };
  }
  return OK;
}
