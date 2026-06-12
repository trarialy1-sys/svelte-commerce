import "server-only";

import { getOrgDb } from "@/lib/db";
import { buildWhere } from "@/lib/module/query";
import { deliveredUnitsBySku } from "@/lib/stock/velocity";
import type { ListParams, ListResult, Row } from "@/lib/module/types";
import { stockConfig } from "@/modules/stock/config";

const SELECT = {
  id: true,
  sku: true,
  title: true,
  inventoryQty: true,
  stockState: true,
  manualOOS: true,
  tracked: true,
  continueSelling: true,
} as const;

const CAP = 5000;

/**
 * Stock listing ordered for action: recent best-sellers first, out-of-stock
 * last. "Best-selling" = delivered units over the trailing 30 days. Falls back
 * to a plain DB sort when the operator clicks a sortable column (sku / title /
 * quantité). The virtual `sold30` field is the default sort key.
 */
export async function listStock(
  orgId: string,
  params: ListParams
): Promise<ListResult> {
  const odb = getOrgDb(orgId);
  const where = buildWhere(stockConfig, params);
  const velocity = await deliveredUnitsBySku(orgId);

  const decorate = (v: {
    id: string;
    sku: string;
    title: string | null;
    inventoryQty: number;
    stockState: string;
    manualOOS: boolean;
    tracked: boolean;
    continueSelling: boolean;
  }): Row => ({
    ...v,
    sold30: velocity.get(v.sku) ?? 0,
    // Untracked or continue-selling variants are always available.
    oos: v.manualOOS || (v.tracked && !v.continueSelling && v.inventoryQty <= 0),
  });

  // Always sort in memory so out-of-stock is grouped last regardless of the
  // chosen column (keeps the "Disponible" / "Rupture" sections clean). Default
  // (sold30 desc) = best-sellers first; a column click sets the secondary sort.
  const all = await odb.variant.findMany({ where, take: CAP, select: SELECT });
  const field = params.sortField || "sold30";
  const dir = params.sortDir === "asc" ? 1 : -1;
  const rows = all.map(decorate).sort((a, b) => {
    const byOos = Number(a.oos) - Number(b.oos); // in-stock (false) before OOS
    if (byOos !== 0) return byOos;
    const av = a[field];
    const bv = b[field];
    const c =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
    return c * dir;
  });

  const start = (params.page - 1) * params.pageSize;
  return {
    rows: rows.slice(start, start + params.pageSize),
    total: rows.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}
