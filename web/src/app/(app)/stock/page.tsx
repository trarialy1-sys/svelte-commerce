import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { computeMetrics, deliveredUnitsBySku } from "@/lib/stock/velocity";
import { StockView } from "./stock-view";
import type { StockRow, StockStatusKey } from "./stock-control";

export const dynamic = "force-dynamic";

const SELECT = {
  id: true,
  sku: true,
  title: true,
  inventoryQty: true,
  manualOOS: true,
  isHero: true,
  reorderThreshold: true,
  leadTimeDays: true,
} as const;

const STATUS_ORDER: Record<StockStatusKey, number> = {
  RUPTURE: 0,
  REORDER: 1,
  FAIBLE: 2,
  OK: 3,
};

export default async function StockPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) return <StockView role={appRole} heroRows={[]} reorderRows={[]} />;

  const odb = getOrgDb(orgId);
  const delivered = await deliveredUnitsBySku(orgId);
  const skusWithSales = [...delivered.keys()];

  // Heroes are always shown; the reorder list is bounded to items that are
  // either low on stock or actively selling (so we don't scan the whole catalog).
  const orClauses: Record<string, unknown>[] = [{ inventoryQty: { lte: 20 } }];
  if (skusWithSales.length) orClauses.push({ sku: { in: skusWithSales } });

  const [heroes, attention] = await Promise.all([
    odb.variant.findMany({
      where: { isHero: true },
      orderBy: { inventoryQty: "asc" },
      take: 200,
      select: SELECT,
    }),
    odb.variant.findMany({
      where: { isHero: false, OR: orClauses },
      take: 500,
      select: SELECT,
    }),
  ]);

  type V = (typeof heroes)[number];
  const toRow = (v: V): StockRow => {
    const m = computeMetrics({
      inventoryQty: v.inventoryQty,
      manualOOS: v.manualOOS,
      deliveredUnits: delivered.get(v.sku) ?? 0,
      reorderThreshold: v.reorderThreshold,
      leadTimeDays: v.leadTimeDays,
    });
    return {
      id: v.id,
      sku: v.sku,
      title: v.title,
      inventoryQty: v.inventoryQty,
      manualOOS: v.manualOOS,
      isHero: v.isHero,
      reorderThreshold: v.reorderThreshold,
      leadTimeDays: v.leadTimeDays,
      velocityPerDay: m.velocityPerDay,
      daysLeft: m.daysLeft,
      status: m.status,
    };
  };

  const heroRows = heroes.map(toRow);
  const reorderRows = attention
    .map(toRow)
    .filter((r) => r.status !== "OK")
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity)
    )
    .slice(0, 50);

  return <StockView role={appRole} heroRows={heroRows} reorderRows={reorderRows} />;
}
