"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { OrderStatus } from "@/generated/prisma/client";
import { importExcel } from "@/lib/orders/import-excel";
import { importShopifyOrders } from "@/lib/orders/import-shopify";
import { setOrderStatus } from "@/lib/orders/status";
import {
  getOrderDetail,
  removeOrderItem,
  removeOutOfStockItems,
  type OrderDetail,
} from "@/lib/orders/remake";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

function fail(e: unknown): { ok: false; message: string } {
  return { ok: false, message: e instanceof Error ? e.message : "Échec" };
}

/** Import orders from an uploaded OzonExpress-format Excel file. */
export async function importExcelAction(
  formData: FormData
): Promise<Result<{ created: number; skipped: number }>> {
  const { orgId } = await requireOrgRole("operator");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Aucun fichier fourni." };
  }
  try {
    const buf = await file.arrayBuffer();
    const res = await importExcel(orgId!, buf);
    revalidatePath("/orders");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

/** Pull recent orders from the connected Shopify store. */
export async function importShopifyAction(
  limit = 50
): Promise<Result<{ created: number; skipped: number }>> {
  const { orgId } = await requireOrgRole("operator");
  try {
    const res = await importShopifyOrders(orgId!, limit);
    revalidatePath("/orders");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

const VALID_STATUSES = new Set<string>(Object.values(OrderStatus));

/** Apply a confirmation outcome to a single order. */
export async function setStatusAction(
  orderId: string,
  status: string,
  opts: { reason?: string; callbackAt?: string } = {}
): Promise<Result<{ id: string; status: string }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, message: "Statut invalide." };
  }
  try {
    const res = await setOrderStatus(orgId!, orderId, status as OrderStatus, {
      actorUserId: userId,
      reason: opts.reason ?? null,
      callbackAt: opts.callbackAt ? new Date(opts.callbackAt) : null,
    });
    revalidatePath("/orders");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

/** Load a single order's full detail (items + stock state + customer). */
export async function getOrderDetailAction(
  orderId: string
): Promise<Result<OrderDetail | null>> {
  const { orgId } = await requireOrgRole("viewer");
  try {
    const detail = await getOrderDetail(orgId!, orderId);
    return { ok: true, data: detail };
  } catch (e) {
    return fail(e);
  }
}

/** Remove a single line item from an order ("remake"). */
export async function removeItemAction(
  orderId: string,
  orderItemId: string
): Promise<Result<{ totalPrice: number; itemsCount: number }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const res = await removeOrderItem(orgId!, orderId, orderItemId, userId);
    revalidatePath("/orders");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

/** Remove every out-of-stock line item from an order. */
export async function removeOosAction(
  orderId: string
): Promise<Result<{ removed: number; totalPrice: number; itemsCount: number }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const res = await removeOutOfStockItems(orgId!, orderId, userId);
    revalidatePath("/orders");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}
