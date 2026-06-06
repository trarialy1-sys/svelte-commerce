import { getAuthContext } from "@/lib/auth";
import { DashboardView } from "./dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { appRole } = await getAuthContext();
  return <DashboardView role={appRole} />;
}
