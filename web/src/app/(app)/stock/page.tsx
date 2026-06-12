import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { StockView } from "./stock-view";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) {
    return <StockView role={appRole} availableCount={0} ruptureCount={0} />;
  }

  const odb = getOrgDb(orgId);
  const [availableCount, ruptureCount] = await Promise.all([
    odb.variant.count({ where: { stockState: { not: "RUPTURE" } } }),
    odb.variant.count({ where: { stockState: "RUPTURE" } }),
  ]);

  return (
    <StockView
      role={appRole}
      availableCount={availableCount}
      ruptureCount={ruptureCount}
    />
  );
}
