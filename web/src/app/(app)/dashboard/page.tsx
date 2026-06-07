import { getAuthContext } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org/settings";
import { DashboardView } from "./dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { appRole, orgId } = await getAuthContext();
  const currency = orgId ? (await getOrgSettings(orgId)).currency : "MAD";
  return <DashboardView role={appRole} currency={currency} />;
}
