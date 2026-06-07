import { requireOrgRole } from "@/lib/auth";
import { auditConfig } from "@/modules/audit/config";
import { ModulePage } from "@/components/module/module-page";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  // Audit logs are sensitive — owner/admin only (the module API also enforces
  // this server-side via auditConfig.minRole).
  const { appRole } = await requireOrgRole("admin");
  return <ModulePage config={auditConfig} role={appRole} />;
}
