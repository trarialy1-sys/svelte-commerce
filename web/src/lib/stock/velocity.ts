import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { LOW_STOCK_THRESHOLD } from "@/lib/integrations/shopify/inventory";

/** Trailing window used to measure how fast a product sells. */
export const VELOCITY_WINDOW_DAYS = 30;
/** Reorder before stockout: alert when days-left ≤ leadTime + this buffer. */
export const REORDER_BUFFER_DAYS = 3;
/** Lead time assumed when a variant hasn't set one (China ≈ 3 weeks). */
export const DEFAULT_LEAD_TIME_DAYS = 21;

export type StockStatus = "RUPTURE" | "REORDER" | "FAIBLE" | "OK";

/**
 * Units actually DELIVERED per SKU over the trailing window — the honest measure
 * of sales velocity for a COD business (created/confirmed orders that never land
 * don't count). Keyed by SKU because OrderItem links to Variant by SKU string.
 */
export async function deliveredUnitsBySku(
  orgId: string,
  days: number = VELOCITY_WINDOW_DAYS
): Promise<Map<string, number>> {
  const odb = getOrgDb(orgId);
  const since = new Date(Date.now() - days * 86_400_000);
  const parcels = await odb.parcel.findMany({
    where: { status: ParcelStatus.LIVRE, updatedAt: { gte: since } },
    select: { orderId: true },
  });
  if (parcels.length === 0) return new Map();

  const grouped = await odb.orderItem.groupBy({
    by: ["sku"],
    where: { orderId: { in: parcels.map((p) => p.orderId) } },
    _sum: { qty: true },
  });
  const m = new Map<string, number>();
  for (const g of grouped) m.set(g.sku, g._sum.qty ?? 0);
  return m;
}

export interface StockMetrics {
  /** Delivered units per day over the window. */
  velocityPerDay: number;
  /** inventoryQty ÷ velocity — null when there were no sales to project from. */
  daysLeft: number | null;
  status: StockStatus;
}

/**
 * Derive a variant's stock status. OOS (manual or qty≤0) wins; otherwise, if it
 * sells and would run out within its lead time (+buffer), it's REORDER; else low
 * stock is FAIBLE; else OK.
 */
export function computeMetrics(opts: {
  inventoryQty: number;
  manualOOS: boolean;
  deliveredUnits: number;
  days?: number;
  reorderThreshold?: number | null;
  leadTimeDays?: number | null;
  /** Shopify inventory tracking; untracked = always available (never rupture). */
  tracked?: boolean;
  /** Shopify "continue selling when out of stock" — also always available. */
  continueSelling?: boolean;
}): StockMetrics {
  const days = opts.days ?? VELOCITY_WINDOW_DAYS;
  const velocityPerDay = opts.deliveredUnits / days;
  const alwaysAvailable = opts.tracked === false || opts.continueSelling === true;

  if (opts.manualOOS) {
    return { velocityPerDay, daysLeft: 0, status: "RUPTURE" };
  }
  if (alwaysAvailable) {
    // Storefront keeps selling regardless of qty — qty is not meaningful.
    return { velocityPerDay, daysLeft: null, status: "OK" };
  }
  if (opts.inventoryQty <= 0) {
    return { velocityPerDay, daysLeft: 0, status: "RUPTURE" };
  }

  const daysLeft = velocityPerDay > 0 ? opts.inventoryQty / velocityPerDay : null;
  const leadTime = opts.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  if (daysLeft != null && daysLeft <= leadTime + REORDER_BUFFER_DAYS) {
    return { velocityPerDay, daysLeft, status: "REORDER" };
  }

  const threshold = opts.reorderThreshold ?? LOW_STOCK_THRESHOLD;
  if (opts.inventoryQty <= threshold) {
    return { velocityPerDay, daysLeft, status: "FAIBLE" };
  }
  return { velocityPerDay, daysLeft, status: "OK" };
}

/**
 * Count variants that should be reordered now (selling + running out within lead
 * time), excluding ones already out of stock. Used by the daily digest.
 */
export async function countReorderNeeded(orgId: string): Promise<number> {
  const delivered = await deliveredUnitsBySku(orgId);
  if (delivered.size === 0) return 0; // no sales → nothing to project

  const odb = getOrgDb(orgId);
  const variants = await odb.variant.findMany({
    where: {
      sku: { in: [...delivered.keys()] },
      inventoryQty: { gt: 0 },
      manualOOS: false,
    },
    select: { sku: true, inventoryQty: true, reorderThreshold: true, leadTimeDays: true },
    take: 2000,
  });

  let n = 0;
  for (const v of variants) {
    const m = computeMetrics({
      inventoryQty: v.inventoryQty,
      manualOOS: false,
      deliveredUnits: delivered.get(v.sku) ?? 0,
      reorderThreshold: v.reorderThreshold,
      leadTimeDays: v.leadTimeDays,
    });
    if (m.status === "REORDER") n++;
  }
  return n;
}
