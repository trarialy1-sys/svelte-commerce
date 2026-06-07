import { getAuthContext, meetsOrgRole, type AppRole } from "@/lib/auth";
import { SettingsNav, type SettingsTab } from "./settings-nav";

export const dynamic = "force-dynamic";

const TABS: Array<
  SettingsTab & { minRole?: AppRole; ownerOnly?: boolean }
> = [
  { href: "/settings/organization", label: "Organisation" },
  { href: "/settings/team", label: "Équipe" },
  { href: "/settings/integrations", label: "Intégrations", ownerOnly: true },
  { href: "/settings/security", label: "Sécurité & audit", minRole: "admin" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appRole } = await getAuthContext();
  const tabs: SettingsTab[] = TABS.filter((t) => {
    if (t.ownerOnly) return appRole === "owner";
    if (t.minRole) return meetsOrgRole(appRole, t.minRole);
    return true;
  }).map(({ href, label }) => ({ href, label }));

  return (
    <div className="flex flex-col gap-6">
      <SettingsNav tabs={tabs} />
      {children}
    </div>
  );
}
