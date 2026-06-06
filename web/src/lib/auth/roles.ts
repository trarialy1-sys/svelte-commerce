/**
 * Client-safe role helpers (no server imports), so both server guards and
 * client components (e.g. DataTable, sidebar) can use them.
 */
export type AppRole = "owner" | "admin" | "operator" | "viewer";

// OWNER(3) > ADMIN(2) > OPERATOR(1) > VIEWER(0)
export const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

/** Non-redirecting role check (for API routes / conditional UI). */
export function meetsOrgRole(appRole: AppRole | null, min: AppRole): boolean {
  return appRole != null && ROLE_RANK[appRole] >= ROLE_RANK[min];
}
