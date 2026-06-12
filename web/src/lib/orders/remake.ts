import "server-only";

import { getOrgDb } from "@/lib/db";

export interface OrderItemDetail {
  id: string;
  sku: string;
  qty: number;
  unitPrice: number;
  /** Resolved product title from the catalog (null if SKU not in catalog). */
  title: string | null;
  /** True when the matching catalog variant is out of stock (qty <= 0 or manual). */
  outOfStock: boolean;
}

export interface OrderDetail {
  id: string;
  code: string;
  status: string;
  source: string;
  cityRaw: string | null;
  address: string | null;
  phone: string | null;
  note: string | null;
  totalPrice: number;
  itemsCount: number;
  confirmedById: string | null;
  confirmedAt: Date | null;
  callbackAt: Date | null;
  attemptCount: number;
  statusReason: string | null;
  createdAt: Date;
  customer: { id: string; name: string; phone: string; city: string | null } | null;
  items: OrderItemDetail[];
}

/**
 * Load a single order with its items, customer, and per-item stock state.
 * Stock is resolved by matching each item SKU against the org's catalog
 * Variants (inventoryQty <= 0 → out of stock). Org-scoped via RLS.
 */
export async function getOrderDetail(
  orgId: string,
  orderId: string
): Promise<OrderDetail | null> {
  const odb = getOrgDb(orgId);
  const order = await odb.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { id: true, name: true, phone: true, city: true } },
    },
  });
  if (!order) return null;

  const skus = order.items.map((i) => i.sku);
  const variants = skus.length
    ? await odb.variant.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, title: true, inventoryQty: true, manualOOS: true, tracked: true },
      })
    : [];
  const bySku = new Map(variants.map((v) => [v.sku, v]));

  return {
    id: order.id,
    code: order.code,
    status: order.status,
    source: order.source,
    cityRaw: order.cityRaw,
    address: order.address,
    phone: order.phone,
    note: order.note,
    totalPrice: Number(order.totalPrice),
    itemsCount: order.itemsCount,
    confirmedById: order.confirmedById,
    confirmedAt: order.confirmedAt,
    callbackAt: order.callbackAt,
    attemptCount: order.attemptCount,
    statusReason: order.statusReason,
    createdAt: order.createdAt,
    customer: order.customer,
    items: order.items.map((i) => {
      const v = bySku.get(i.sku);
      return {
        id: i.id,
        sku: i.sku,
        qty: i.qty,
        unitPrice: Number(i.unitPrice),
        title: v?.title ?? null,
        outOfStock: v ? v.manualOOS || (v.tracked && v.inventoryQty <= 0) : false,
      };
    }),
  };
}

/**
 * Remove a single line item from an order ("remake"), recomputing the order
 * total and item count. Returns the updated totals. Org-scoped + audited.
 */
export async function removeOrderItem(
  orgId: string,
  orderId: string,
  orderItemId: string,
  actorUserId?: string | null
): Promise<{ totalPrice: number; itemsCount: number }> {
  const odb = getOrgDb(orgId);

  const item = await odb.orderItem.findUnique({
    where: { id: orderItemId },
    select: { id: true, orderId: true, qty: true, unitPrice: true, sku: true },
  });
  if (!item || item.orderId !== orderId) {
    throw new Error("Order item not found for this order");
  }

  const order = await odb.order.findUnique({
    where: { id: orderId },
    select: { totalPrice: true, itemsCount: true },
  });
  if (!order) throw new Error("Order not found");

  await odb.orderItem.delete({ where: { id: orderItemId } });

  const removedValue = item.qty * Number(item.unitPrice);
  const nextTotal = Math.max(0, Number(order.totalPrice) - removedValue);
  const nextCount = Math.max(0, order.itemsCount - 1);

  const updated = await odb.order.update({
    where: { id: orderId },
    data: { totalPrice: nextTotal, itemsCount: nextCount },
    select: { totalPrice: true, itemsCount: true },
  });

  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId: actorUserId ?? null,
      action: "order.remake",
      entity: "Order",
      entityId: orderId,
      meta: { removedItemId: orderItemId, sku: item.sku, removedValue },
    },
  });

  return {
    totalPrice: Number(updated.totalPrice),
    itemsCount: updated.itemsCount,
  };
}

/**
 * Remove every out-of-stock line item from an order in one pass (bulk remake).
 * "Out of stock" = matching catalog Variant has inventoryQty <= 0.
 */
export async function removeOutOfStockItems(
  orgId: string,
  orderId: string,
  actorUserId?: string | null
): Promise<{ removed: number; totalPrice: number; itemsCount: number }> {
  const detail = await getOrderDetail(orgId, orderId);
  if (!detail) throw new Error("Order not found");

  const oos = detail.items.filter((i) => i.outOfStock);
  let totalPrice = detail.totalPrice;
  let itemsCount = detail.itemsCount;

  for (const item of oos) {
    const res = await removeOrderItem(orgId, orderId, item.id, actorUserId);
    totalPrice = res.totalPrice;
    itemsCount = res.itemsCount;
  }

  return { removed: oos.length, totalPrice, itemsCount };
}
