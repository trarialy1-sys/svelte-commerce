import { clerkClient } from "@clerk/nextjs/server";

import { getAuthContext, meetsOrgRole, type AppRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { ROLE_RANK } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { TeamClient, type PendingInvite, type TeamMember } from "./team-client";

export const dynamic = "force-dynamic";

function inviteAppRole(publicMetadata: unknown, coarse: string): AppRole {
  const v = (publicMetadata as { appRole?: unknown } | null)?.appRole;
  if (v === "owner" || v === "admin" || v === "operator" || v === "viewer") {
    return v;
  }
  return coarse === "org:admin" ? "admin" : "operator";
}

export default async function TeamPage() {
  const { orgId, userId, appRole } = await getAuthContext();
  const canManage = meetsOrgRole(appRole, "admin");

  let members: TeamMember[] = [];
  let invites: PendingInvite[] = [];

  if (orgId) {
    const rows = await getOrgDb(orgId).membership.findMany({
      include: { user: { select: { name: true, email: true } } },
    });
    members = rows
      .map((m) => ({
        userId: m.userId,
        name: m.user?.name ?? null,
        email: m.user?.email ?? m.userId,
        role: m.role.toLowerCase() as AppRole,
      }))
      .sort(
        (a, b) =>
          ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.email.localeCompare(b.email)
      );

    try {
      const c = await clerkClient();
      const list = await c.organizations.getOrganizationInvitationList({
        organizationId: orgId,
        status: ["pending"],
      });
      invites = list.data.map((inv) => ({
        id: inv.id,
        email: inv.emailAddress,
        role: inviteAppRole(inv.publicMetadata, inv.role),
      }));
    } catch (e) {
      // Clerk may be unconfigured locally — the member list still renders.
      console.error("[team] invitation list failed", e);
    }
  }

  return (
    <>
      <PageHeader title="Équipe" subtitle="Membres, rôles et invitations." />
      <TeamClient
        members={members}
        invites={invites}
        canManage={canManage}
        callerRole={appRole}
        currentUserId={userId}
      />
    </>
  );
}
