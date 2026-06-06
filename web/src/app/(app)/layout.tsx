import { getActiveOrgName, getAuthContext, requireAuth } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { NoOrgScreen } from "@/components/shell/no-org-screen";

// The whole authed app reads live auth/DB state — never prerender.
export const dynamic = "force-dynamic";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  const { orgId, appRole, isPlatformAdmin } = await getAuthContext();

  // No active org → clean screen instead of the shell.
  if (!orgId) {
    return <NoOrgScreen />;
  }

  const orgName = await getActiveOrgName(orgId);

  return (
    <AppShell orgName={orgName} role={appRole} isPlatformAdmin={isPlatformAdmin}>
      {children}
    </AppShell>
  );
}
