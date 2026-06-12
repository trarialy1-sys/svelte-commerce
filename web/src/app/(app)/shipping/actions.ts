"use server";

import { revalidatePath } from "next/cache";

import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";
import { learnCityAlias } from "@/lib/shipping/learn";
import { persistConfidentCities } from "@/lib/shipping/auto-city";
import { createParcelForOrder, type ParcelResult } from "@/lib/shipping/ozon";
import { buildBLOnly, createDeliveryNote, type BLResult } from "@/lib/shipping/bl";
import { syncParcelStatuses, type SyncResult } from "@/lib/shipping/status-sync";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Manual "Actualiser les statuts" — poll OzonExpress for this org's active
 * parcels and update changed statuses. Operator+ (operational, like sending).
 */
export async function syncStatusesAction(): Promise<Result<SyncResult>> {
  const { orgId, userId } = await requireOrgRole("operator");
  const res = await syncParcelStatuses(orgId!, { actorUserId: userId });
  if (!res.configured) {
    return {
      ok: false,
      message: "Suivi OzonExpress pas encore configuré (endpoint en attente).",
    };
  }
  revalidatePath("/shipping");
  revalidatePath("/dashboard");
  return { ok: true, data: res };
}

/**
 * Persist an operator's city correction on an order and learn the alias.
 * Sets `Order.cityId`, then `learnCityAlias` (skips casa/casablanca). Operator+.
 */
export async function saveCityPickAction(
  orderId: string,
  cityId: number,
  cityRaw: string
): Promise<Result<{ cityId: number }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  if (!Number.isFinite(cityId)) {
    return { ok: false, message: "Ville invalide." };
  }
  try {
    await getOrgDb(orgId!).order.update({
      where: { id: orderId },
      data: { cityId },
    });
    await learnCityAlias(orgId!, cityRaw, cityId, userId);
    revalidatePath("/shipping");
    return { ok: true, data: { cityId } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/** Persist several auto-detected cities at once (and learn each alias). */
export async function saveCityPicksAction(
  picks: { orderId: string; cityId: number; cityRaw: string }[]
): Promise<Result<{ count: number }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  const odb = getOrgDb(orgId!);
  let count = 0;
  try {
    for (const p of picks) {
      if (!Number.isFinite(p.cityId)) continue;
      await odb.order.update({
        where: { id: p.orderId },
        data: { cityId: p.cityId },
      });
      await learnCityAlias(orgId!, p.cityRaw, p.cityId, userId);
      count++;
    }
    revalidatePath("/shipping");
    return { ok: true, data: { count } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/**
 * ⚠️ LIVE: create real parcels at OzonExpress for the selected orders.
 * Runs one at a time, returns a per-order result (OK / FAILED / Used-Before).
 */
export async function sendParcelsAction(
  orderIds: string[],
  stock: number
): Promise<Result<{ results: ParcelResult[] }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    // Auto-save confidently-detected cities so a correct name never needs a
    // manual "confirm" before shipping.
    await persistConfidentCities(orgId!, orderIds, userId);
    const results: ParcelResult[] = [];
    for (const id of orderIds) {
      results.push(
        await createParcelForOrder(orgId!, id, { stock, actorUserId: userId })
      );
    }
    revalidatePath("/shipping");
    return { ok: true, data: { results } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/** ⚠️ LIVE: resend a single parcel, optionally with an operator-edited tracking. */
export async function retryOneAction(
  orderId: string,
  stock: number,
  customTracking?: string
): Promise<Result<ParcelResult>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    if (!customTracking?.trim()) {
      await persistConfidentCities(orgId!, [orderId], userId);
    }
    const res = await createParcelForOrder(orgId!, orderId, {
      stock,
      tracking: customTracking?.trim() || undefined,
      actorUserId: userId,
    });
    revalidatePath("/shipping");
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/** ⚠️ LIVE: build ONE Bon de Livraison from tracking codes (always a NEW note). */
export async function createDeliveryNoteAction(
  codes: string[]
): Promise<Result<BLResult>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const bl = await createDeliveryNote(orgId!, codes, userId);
    revalidatePath("/shipping");
    return { ok: true, data: bl };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/**
 * Hard-delete the selected orders (operator+). Items and any parcel cascade
 * (onDelete: Cascade). Use for test/duplicate rows you don't want to ship.
 */
export async function deleteOrdersAction(
  orderIds: string[]
): Promise<Result<{ deleted: number }>> {
  const { orgId } = await requireOrgRole("operator");
  const ids = orderIds.filter((id) => typeof id === "string" && id);
  if (ids.length === 0) return { ok: false, message: "Aucune commande sélectionnée." };
  try {
    const res = await getOrgDb(orgId!).order.deleteMany({
      where: { id: { in: ids } },
    });
    revalidatePath("/shipping");
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    return { ok: true, data: { deleted: res.count } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/** ⚠️ LIVE: BL-only path for codes whose parcels already exist at Ozon. */
export async function buildBLOnlyAction(
  codes: string[]
): Promise<Result<BLResult>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const bl = await buildBLOnly(orgId!, codes, userId);
    revalidatePath("/shipping");
    return { ok: true, data: bl };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}
