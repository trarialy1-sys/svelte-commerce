import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { PARCEL_IN_TRANSIT } from "@/lib/parcel-status";

export interface CashPosition {
  /** COD on parcels still in transit — collected only if they deliver. */
  inTransitCod: number;
  /** Total COD on delivered parcels. */
  deliveredCod: number;
  /** Already remitted by Ozon (all time). */
  remitted: number;
  /** Delivered COD not yet remitted — owed to you. */
  awaitingRemittance: number;
  /** Capital tied up in on-hand stock, at landed cost. */
  stockValue: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Live cash snapshot (not period-bound): what's coming in (COD in transit +
 * delivered-awaiting-remittance) vs capital locked in stock. COD remits on a lag
 * while ad/China spend is upfront — this shows the timing, not just the margin.
 */
export async function getCashPosition(orgId: string): Promise<CashPosition> {
  const odb = getOrgDb(orgId);
  const [inTransit, delivered, remit, variants] = await Promise.all([
    odb.parcel.aggregate({
      _sum: { codPrice: true },
      where: { status: { in: PARCEL_IN_TRANSIT } },
    }),
    odb.parcel.aggregate({
      _sum: { codPrice: true },
      where: { status: ParcelStatus.LIVRE },
    }),
    odb.remittance.aggregate({ _sum: { amount: true } }),
    odb.variant.findMany({
      where: { inventoryQty: { gt: 0 } },
      select: { inventoryQty: true, cost: true, freightCost: true },
    }),
  ]);

  const deliveredCod = Number(delivered._sum.codPrice ?? 0);
  const remitted = Number(remit._sum.amount ?? 0);
  const stockValue = variants.reduce(
    (s, v) => s + v.inventoryQty * (Number(v.cost ?? 0) + Number(v.freightCost ?? 0)),
    0
  );

  return {
    inTransitCod: round2(Number(inTransit._sum.codPrice ?? 0)),
    deliveredCod: round2(deliveredCod),
    remitted: round2(remitted),
    awaitingRemittance: round2(Math.max(0, deliveredCod - remitted)),
    stockValue: round2(stockValue),
  };
}
