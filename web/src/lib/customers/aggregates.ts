import "server-only";

import { withOrg } from "@/lib/db";

export interface CustomerAgg {
  delivered: number;
  returned: number;
  codDelivered: number;
}

const EMPTY: CustomerAgg = { delivered: 0, returned: 0, codDelivered: 0 };

/**
 * COD-aware per-customer parcel aggregates, computed on the fly (no
 * denormalization). One grouped query scoped to the given customer ids, run
 * inside the org RLS context. Definitions mirror the dashboard:
 *   delivered      = parcels status = LIVRE
 *   returned       = parcels status in (RETOURNE, REFUSE)
 *   codDelivered   = Σ codPrice where status = LIVRE  (delivered COD value,
 *                    NOT remitted cash — never labelled "encaissé")
 */
export async function customerAggregates(
  orgId: string,
  customerIds: string[]
): Promise<Map<string, CustomerAgg>> {
  const map = new Map<string, CustomerAgg>();
  if (customerIds.length === 0) return map;

  const rows = await withOrg(orgId, (tx) =>
    tx.$queryRaw<
      { customerId: string; delivered: number; returned: number; cod: number }[]
    >`
      SELECT o."customerId" AS "customerId",
             count(*) FILTER (WHERE p.status = 'LIVRE')::int AS delivered,
             count(*) FILTER (WHERE p.status IN ('RETOURNE','REFUSE'))::int AS returned,
             COALESCE(sum(p."codPrice") FILTER (WHERE p.status = 'LIVRE'), 0)::float8 AS cod
      FROM "Order" o
      JOIN "Parcel" p ON p."orderId" = o.id
      WHERE o."customerId" = ANY(${customerIds})
      GROUP BY o."customerId"`
  );

  for (const r of rows) {
    map.set(r.customerId, {
      delivered: Number(r.delivered),
      returned: Number(r.returned),
      codDelivered: Number(r.cod),
    });
  }
  return map;
}

/** Return rate = returned / (delivered + returned), divide-by-zero guarded. */
export function returnRate(a: CustomerAgg): number {
  const denom = a.delivered + a.returned;
  return denom > 0 ? a.returned / denom : 0;
}

/** Bucket a customer's reliability for the list badge. */
export function returnState(a: CustomerAgg): "none" | "ok" | "probleme" {
  const denom = a.delivered + a.returned;
  if (denom === 0) return "none";
  return returnRate(a) >= 0.3 ? "probleme" : "ok";
}

export { EMPTY as EMPTY_AGG };
