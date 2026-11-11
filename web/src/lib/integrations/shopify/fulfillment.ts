import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "./client";

/**
 * Mark shipped orders as fulfilled in Shopify.
 *
 * Why: Shopify reserves stock when an order is placed and only really deducts
 * it when the order is fulfilled. Parcels go out through Ozon but the Shopify
 * orders stayed "unfulfilled", so "committed" kept growing and on-hand counts
 * drifted. Fulfilling the order once Ozon has PICKED UP the parcel turns the
 * reservation into the real deduction — "available" does not move.
 *
 * A parcel that is only created at Ozon (status CREE) is NOT fulfilled: the
 * team sometimes creates the parcel and then finds the item out of stock, so
 * it never leaves. Only a parcel Ozon has taken counts as shipped.
 *
 * OFF by default (`FULFILL_ON_SHIP=1` in Vercel turns it on). Needs the
 * `write_merchant_managed_fulfillment_orders` scope (reconnect Shopify once).
 * No customer notification is sent.
 */
export function fulfilOnShipEnabled(): boolean {
  return /^(1|true|on|yes)$/i.test(process.env.FULFILL_ON_SHIP ?? "");
}

const FULFILLMENT_ORDERS = `
query FulfillmentOrders($id: ID!) {
  order(id: $id) {
    cancelledAt
    fulfillmentOrders(first: 20) { nodes { id status } }
  }
}`;

const FULFILLMENT_CREATE = `
mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id }
    userErrors { field message }
  }
}`;

export type FulfilOutcome = "FULFILLED" | "NOTHING_OPEN" | "CANCELLED" | "NOT_FOUND";

/** What to do with an order, from its fulfillment orders. Pure — unit-tested. */
export function decideFulfilment(order: {
  cancelledAt?: string | null;
  fulfillmentOrders?: { nodes: { id: string; status: string }[] } | null;
} | null): { outcome: Exclude<FulfilOutcome, "FULFILLED"> } | { outcome: "FULFILL"; ids: string[] } {
  if (!order) return { outcome: "NOT_FOUND" };
  if (order.cancelledAt) return { outcome: "CANCELLED" };
  const ids = (order.fulfillmentOrders?.nodes ?? [])
    .filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS")
    .map((f) => f.id);
  return ids.length ? { outcome: "FULFILL", ids } : { outcome: "NOTHING_OPEN" };
}

/** Ozon has the parcel in hand (picked up or any later state). Pure — unit-tested. */
export const SHIPPED_STATUSES: ParcelStatus[] = [
  ParcelStatus.RAMASSE,
  ParcelStatus.EN_TRANSIT,
  ParcelStatus.LIVRE,
  ParcelStatus.REFUSE,
  ParcelStatus.RETOURNE,
];

export function isShipped(status: ParcelStatus): boolean {
  return SHIPPED_STATUSES.includes(status);
}

const ORDER_FULFILLMENTS = `
query OrderFulfillments($id: ID!) {
  order(id: $id) {
    fulfillments(first: 20) { id status trackingInfo(first: 5) { number } }
  }
}`;

const FULFILLMENT_CANCEL = `
mutation FulfillmentCancel($id: ID!) {
  fulfillmentCancel(id: $id) {
    fulfillment { id status }
    userErrors { field message }
  }
}`;

/**
 * Undo a fulfilment WE created (same Ozon tracking) for a parcel Ozon has not
 * picked up. Returns how many fulfilments were cancelled. Fulfilments made by
 * hand or by another app (different tracking) are never touched.
 */
export async function unfulfilShopifyOrder(
  orgId: string,
  shopifyOrderId: string,
  tracking: string
): Promise<number> {
  const { gql } = await getShopifyClient(orgId);
  const data = await gql<{
    order: {
      fulfillments: { id: string; status: string; trackingInfo: { number: string | null }[] }[];
    } | null;
  }>(ORDER_FULFILLMENTS, { id: shopifyOrderId });
  const ours = (data.order?.fulfillments ?? []).filter(
    (f) => f.status === "SUCCESS" && f.trackingInfo.some((t) => t.number === tracking)
  );
  for (const f of ours) {
    const resp = await gql<{
      fulfillmentCancel: { userErrors: { message: string }[] };
    }>(FULFILLMENT_CANCEL, { id: f.id });
    const errs = resp.fulfillmentCancel?.userErrors ?? [];
    if (errs.length) throw new Error(`Shopify: ${errs.map((e) => e.message).join("; ")}`);
  }
  return ours.length;
}

export async function fulfilShopifyOrder(
  orgId: string,
  shopifyOrderId: string,
  tracking: string
): Promise<FulfilOutcome> {
  const { gql } = await getShopifyClient(orgId);
  const data = await gql<{
    order: Parameters<typeof decideFulfilment>[0];
  }>(FULFILLMENT_ORDERS, { id: shopifyOrderId });
  const d = decideFulfilment(data.order);
  if (d.outcome !== "FULFILL") return d.outcome;
  const resp = await gql<{
    fulfillmentCreate: { userErrors: { message: string }[] };
  }>(FULFILLMENT_CREATE, {
    fulfillment: {
      notifyCustomer: false,
      trackingInfo: { number: tracking, company: "Ozon Express" },
      lineItemsByFulfillmentOrder: d.ids.map((fulfillmentOrderId) => ({ fulfillmentOrderId })),
    },
  });
  const errs = resp.fulfillmentCreate?.userErrors ?? [];
  if (errs.length) throw new Error(`Shopify: ${errs.map((e) => e.message).join("; ")}`);
  return "FULFILLED";
}

export interface FulfilRunResult {
  enabled: boolean;
  checked: number;
  fulfilled: number;
  skipped: number;
  /** Fulfilments taken back because Ozon never picked the parcel up. */
  undone: number;
  errors: string[];
}

/**
 * Fulfil the Shopify orders of parcels Ozon has picked up and that were not
 * handled yet. First takes back any fulfilment we made for a parcel that is
 * still only "created" at Ozon (not picked up). Small batches, newest first; each parcel is handled once (`fulfilledAt`),
 * and a failure (missing scope, Shopify down) leaves it for the next run.
 * `days` bounds how far back we go — the history is cleaned separately.
 */
export async function fulfilShippedParcels(
  orgId: string,
  opts: { days?: number; limit?: number } = {}
): Promise<FulfilRunResult> {
  const out: FulfilRunResult = { enabled: fulfilOnShipEnabled(), checked: 0, fulfilled: 0, skipped: 0, undone: 0, errors: [] };
  if (!out.enabled) return out;
  const odb = getOrgDb(orgId);
  const days = opts.days ?? Number(process.env.FULFILL_ON_SHIP_DAYS ?? 20);

  // Take back what we fulfilled too early (parcel created, never picked up).
  const early = await odb.parcel.findMany({
    where: {
      fulfilNote: "FULFILLED",
      status: ParcelStatus.CREE,
      tracking: { not: null },
      order: { shopifyOrderId: { not: null } },
    },
    select: { id: true, tracking: true, order: { select: { code: true, shopifyOrderId: true } } },
    take: 60,
  });
  for (const p of early) {
    try {
      const n = await unfulfilShopifyOrder(orgId, p.order.shopifyOrderId!, p.tracking!);
      await odb.parcel.update({
        where: { id: p.id },
        data: { fulfilledAt: null, fulfilNote: n > 0 ? "UNDONE" : "UNDONE_NOTHING" },
      });
      out.undone += n > 0 ? 1 : 0;
    } catch (e) {
      out.errors.push(`${p.order.code}: ${(e as Error).message}`.slice(0, 200));
      if (out.errors.length >= 3) return out;
    }
  }

  const parcels = await odb.parcel.findMany({
    where: {
      fulfilledAt: null,
      status: { in: SHIPPED_STATUSES },
      tracking: { not: null },
      createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
      order: { shopifyOrderId: { not: null } },
    },
    select: { id: true, tracking: true, order: { select: { code: true, shopifyOrderId: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 40,
  });
  for (const p of parcels) {
    out.checked++;
    try {
      const outcome = await fulfilShopifyOrder(orgId, p.order.shopifyOrderId!, p.tracking!);
      await odb.parcel.update({
        where: { id: p.id },
        data: { fulfilledAt: new Date(), fulfilNote: outcome },
      });
      if (outcome === "FULFILLED") out.fulfilled++;
      else out.skipped++;
    } catch (e) {
      out.errors.push(`${p.order.code}: ${(e as Error).message}`.slice(0, 200));
      // Same cause for every parcel (scope / outage): stop, retry next hour.
      if (out.errors.length >= 3) break;
    }
  }
  if (out.fulfilled > 0 || out.undone > 0) {
    await odb.auditLog.create({
      data: {
        orgId,
        action: "shipping.orders_fulfilled",
        entity: "Parcel",
        meta: { checked: out.checked, fulfilled: out.fulfilled, skipped: out.skipped, undone: out.undone },
      },
    });
  }
  return out;
}
