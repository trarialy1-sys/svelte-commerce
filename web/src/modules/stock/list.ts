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
  }): Row => ({
    ...v,
    sold30: velocity.get(v.sku) ?? 0,
    // Untracked variants are always available → not out of stock.
    oos: v.manualOOS || (v.tracked && v.inventoryQty <= 0),
  });

  // Explicit column sort → let the DB do it (and paginate there).
  if (params.sortField && params.sortField !== "sold30") {
    const [variants, total] = await Promise.all([
      odb.variant.findMany({
        where,
        orderBy: { [params.sortField]: params.sortDir },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: SELECT,
      }),
      odb.variant.count({ where }),
    ]);
    return {
      rows: variants.map(decorate),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  // Default: best-sellers first, out-of-stock last (sort in memory on velocity).
  const all = await odb.variant.findMany({ where, take: CAP, select: SELECT });
  const rows = all.map(decorate).sort(
    (a, b) =>
      Number(a.oos) - Number(b.oos) || // in-stock before out-of-stock
      (b.sold30 as number) - (a.sold30 as number) || // best-selling first
      (b.inventoryQty as number) - (a.inventoryQty as number)
  );

  const start = (params.page - 1) * params.pageSize;
  return {
    rows: rows.slice(start, start + params.pageSize),
    total: rows.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}
