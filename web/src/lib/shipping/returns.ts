import "server-only";

import { getOrgDb } from "@/lib/db";
import {
  adjustStockBySku,
  type StockDeltaResult,
} from "@/lib/integrations/shopify/inventory";

/**
 * Returns workflow (ported from the Google Sheet « Suivi Ozon »):
 *
 * 1. Ozon marks the parcel « Retourné · Reçu par client » → the status sync
 *    calls `restockReturnedParcel`: every item goes back in stock (+qty), the
 *    parcel is flagged `returnCheck = A_VERIFIER`. Never twice (`restockedAt`).
 * 2. In the warehouse the team opens the parcel:
 *    - all good → `confirmReturn` (OK, stock untouched);
 *    - an item is not ours / missing / damaged → `correctReturn` removes ONLY
 *      those items from stock again (CORRIGE + note → claim at Ozon).
 */

/**
 * Auto-restock switch. OFF by default while the Google Sheet « Suivi Ozon »
 * still restocks returns itself (both on → Shopify gets +2). Turn ON
 * (`RETURNS_AUTO_RESTOCK=1` in Vercel) the day the sheet trigger is stopped.
 * When OFF, returns are still detected and listed, stock is left alone.
 */
export function autoRestockEnabled(): boolean {
  return /^(1|true|on|yes)$/i.test(process.env.RETURNS_AUTO_RESTOCK ?? "");
}

export const RETURN_CHECK = {
  PENDING: "A_VERIFIER",
  OK: "OK",
  CORRECTED: "CORRIGE",
} as const;

async function parcelWithItems(orgId: string, parcelId: string) {
  const odb = getOrgDb(orgId);
  return odb.parcel.findUnique({
    where: { id: parcelId },
    select: {
      id: true,
      tracking: true,
      restockedAt: true,
      returnCheck: true,
      order: { select: { id: true, code: true, items: { select: { sku: true, qty: true } } } },
    },
  });
}

/** Put a returned parcel's items back in stock (idempotent). */
export async function restockReturnedParcel(
  orgId: string,
  parcelId: string,
  actorUserId: string | null = null
): Promise<{ restocked: boolean; results: StockDeltaResult[] }> {
  const odb = getOrgDb(orgId);
  const p = await parcelWithItems(orgId, parcelId);
  if (!p || p.restockedAt) return { restocked: false, results: [] };

  // Claim the restock atomically first: two overlapping syncs (hourly job +
  // manual refresh) must never both add the stock.
  const claim = await odb.parcel.updateMany({
    where: { id: p.id, restockedAt: null },
    data: { restockedAt: new Date(), returnCheck: RETURN_CHECK.PENDING },
  });
  if (claim.count === 0) return { restocked: false, results: [] };

  let results: StockDeltaResult[];
  try {
    results = await adjustStockBySku(
      orgId,
      p.order.items.map((i) => ({ sku: i.sku, delta: Math.max(1, i.qty) })),
      "received"
    );
  } catch (e) {
    // Nothing was written to Shopify → release the claim so the next run retries.
    await odb.parcel.update({
      where: { id: p.id },
      data: { restockedAt: null, returnCheck: null },
    });
    throw e;
  }
  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "stock.return_restocked",
      entity: "Parcel",
      entityId: p.id,
      meta: { tracking: p.tracking, order: p.order.code, results: results as object[] },
    },
  });
  return { restocked: true, results };
}

/** Warehouse check: the returned contents are correct. */
export async function confirmReturn(
  orgId: string,
  parcelId: string,
  userId: string | null
): Promise<void> {
  const odb = getOrgDb(orgId);
  const res = await odb.parcel.updateMany({
    where: { id: parcelId, returnCheck: RETURN_CHECK.PENDING },
    data: {
      returnCheck: RETURN_CHECK.OK,
      returnCheckAt: new Date(),
      returnCheckBy: userId,
    },
  });
  if (res.count === 0) throw new Error("Ce retour a déjà été vérifié.");
}

/**
 * Warehouse check: some items are wrong (not ours / missing / damaged) →
 * remove only those from stock again. `skus` must belong to the parcel.
 */
export async function correctReturn(
  orgId: string,
  parcelId: string,
  skus: string[],
  note: string,
  userId: string | null
): Promise<StockDeltaResult[]> {
  const odb = getOrgDb(orgId);
  const p = await parcelWithItems(orgId, parcelId);
  if (!p) throw new Error("Colis introuvable.");
  if (p.returnCheck !== RETURN_CHECK.PENDING) {
    throw new Error("Ce retour a déjà été vérifié.");
  }
  const wanted = new Set(skus.map((s) => s.trim()).filter(Boolean));
  const items = p.order.items.filter((i) => wanted.has(i.sku));
  if (items.length === 0) throw new Error("Coche au moins un article du colis.");
  if (!note.trim()) throw new Error("Écris une explication (ex. : produit pas à nous).");

  // Claim the check first (double-click / two people on the same parcel).
  const claim = await odb.parcel.updateMany({
    where: { id: p.id, returnCheck: RETURN_CHECK.PENDING },
    data: {
      returnCheck: RETURN_CHECK.CORRECTED,
      returnCheckAt: new Date(),
      returnCheckBy: userId,
      returnCheckNote: note.trim().slice(0, 500),
    },
  });
  if (claim.count === 0) throw new Error("Ce retour a déjà été vérifié.");

  let results: StockDeltaResult[];
  try {
    results = await adjustStockBySku(
      orgId,
      items.map((i) => ({ sku: i.sku, delta: -Math.max(1, i.qty) })),
      "correction"
    );
  } catch (e) {
    await odb.parcel.update({
      where: { id: p.id },
      data: { returnCheck: RETURN_CHECK.PENDING, returnCheckAt: null, returnCheckBy: null, returnCheckNote: null },
    });
    throw e;
  }
  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId: userId,
      action: "stock.return_corrected",
      entity: "Parcel",
      entityId: p.id,
      meta: { tracking: p.tracking, order: p.order.code, note: note.trim(), results: results as object[] },
    },
  });
  return results;
}
