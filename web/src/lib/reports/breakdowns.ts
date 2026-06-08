import "server-only";

import { db, getOrgDb, withOrg } from "@/lib/db";
import type { DateRange } from "./period";

/**
 * Breakdown reports — the same window semantics as the Performance report so
 * totals reconcile: `orders`/`units`/`revenue` are the cohort created in-range
 * (`Order.createdAt`); `delivered`/`returned`/`codLivre` are status-transitions
 * in-range (`Parcel.updatedAt`). The OR in the WHERE keeps rows that match
 * either window; per-row FILTERs apply each window precisely.
 */

export interface CityRow {
  cityId: number | null;
  city: string;
  orders: number;
  delivered: number;
  returned: number;
  returnRate: number; // % count-weighted: returned / (delivered + returned)
  codLivre: number;
}

export interface ProductRow {
  sku: string;
  title: string | null;
  orders: number;
  units: number;
  revenue: number;
  delivered: number;
  returned: number;
  returnRate: number;
}

const rate = (delivered: number, returned: number): number => {
  const resolved = delivered + returned;
  return resolved > 0 ? Math.round((returned / resolved) * 100) : 0;
};

interface CityRaw {
  city_id: number | null;
  orders: number;
  delivered: number;
  returned: number;
  cod_livre: number;
}

/** Par ville — orders/delivered/returned/return-rate/COD livré by city. */
export async function getCityReport(
  orgId: string,
  range: DateRange
): Promise<CityRow[]> {
  const { from, to } = range;
  const rows = await withOrg(orgId, (tx) =>
    tx.$queryRawUnsafe<CityRaw[]>(
      `
      SELECT o."cityId" AS city_id,
             count(*) FILTER (WHERE o."createdAt" >= $1 AND o."createdAt" <= $2)::int AS orders,
             count(*) FILTER (WHERE p.status = 'LIVRE' AND p."updatedAt" >= $1 AND p."updatedAt" <= $2)::int AS delivered,
             count(*) FILTER (WHERE p.status IN ('RETOURNE','REFUSE') AND p."updatedAt" >= $1 AND p."updatedAt" <= $2)::int AS returned,
             COALESCE(sum(p."codPrice") FILTER (WHERE p.status = 'LIVRE' AND p."updatedAt" >= $1 AND p."updatedAt" <= $2),0)::float8 AS cod_livre
      FROM "Order" o
      LEFT JOIN "Parcel" p ON p."orderId" = o.id
      WHERE (o."createdAt" >= $1 AND o."createdAt" <= $2)
         OR (p."updatedAt" >= $1 AND p."updatedAt" <= $2)
      GROUP BY o."cityId"
      `,
      from,
      to
    )
  );

  // Resolve OzonExpress city names (CityCatalog is global — base client).
  const ids = rows
    .map((r) => r.city_id)
    .filter((x): x is number => typeof x === "number");
  const cities = ids.length
    ? await db.cityCatalog.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(cities.map((c) => [c.id, c.name]));

  return rows
    .map((r) => ({
      cityId: r.city_id,
      city:
        r.city_id == null
          ? "Ville non résolue"
          : nameById.get(r.city_id) ?? `#${r.city_id}`,
      orders: Number(r.orders),
      delivered: Number(r.delivered),
      returned: Number(r.returned),
      returnRate: rate(Number(r.delivered), Number(r.returned)),
      codLivre: Number(r.cod_livre),
    }))
    .sort((a, b) => b.orders - a.orders || b.codLivre - a.codLivre);
}

interface ProductRaw {
  sku: string;
  orders: number;
  units: number;
  revenue: number;
  delivered: number;
  returned: number;
}

/** Par produit — orders/units/revenue/delivered/return-rate by SKU. */
export async function getProductReport(
  orgId: string,
  range: DateRange
): Promise<ProductRow[]> {
  const { from, to } = range;
  const rows = await withOrg(orgId, (tx) =>
    tx.$queryRawUnsafe<ProductRaw[]>(
      `
      SELECT oi.sku AS sku,
             count(DISTINCT o.id) FILTER (WHERE o."createdAt" >= $1 AND o."createdAt" <= $2)::int AS orders,
             COALESCE(sum(oi.qty) FILTER (WHERE o."createdAt" >= $1 AND o."createdAt" <= $2),0)::int AS units,
             COALESCE(sum(oi.qty * oi."unitPrice") FILTER (WHERE o."createdAt" >= $1 AND o."createdAt" <= $2),0)::float8 AS revenue,
             count(DISTINCT o.id) FILTER (WHERE p.status = 'LIVRE' AND p."updatedAt" >= $1 AND p."updatedAt" <= $2)::int AS delivered,
             count(DISTINCT o.id) FILTER (WHERE p.status IN ('RETOURNE','REFUSE') AND p."updatedAt" >= $1 AND p."updatedAt" <= $2)::int AS returned
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      LEFT JOIN "Parcel" p ON p."orderId" = o.id
      WHERE (o."createdAt" >= $1 AND o."createdAt" <= $2)
         OR (p."updatedAt" >= $1 AND p."updatedAt" <= $2)
      GROUP BY oi.sku
      `,
      from,
      to
    )
  );

  // Resolve a display title per SKU (org-scoped Variant; first non-null wins).
  const skus = [...new Set(rows.map((r) => r.sku))];
  const variants = skus.length
    ? await getOrgDb(orgId).variant.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, title: true },
      })
    : [];
  const titleBySku = new Map<string, string | null>();
  for (const v of variants) {
    if (!titleBySku.get(v.sku)) titleBySku.set(v.sku, v.title);
  }

  return rows
    .map((r) => ({
      sku: r.sku,
      title: titleBySku.get(r.sku) ?? null,
      orders: Number(r.orders),
      units: Number(r.units),
      revenue: Number(r.revenue),
      delivered: Number(r.delivered),
      returned: Number(r.returned),
      returnRate: rate(Number(r.delivered), Number(r.returned)),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);
}
