"use server";

import { revalidatePath } from "next/cache";

import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";
import { learnCityAlias } from "@/lib/shipping/learn";
import { createParcelForOrder, type ParcelResult } from "@/lib/shipping/ozon";
import { buildBLOnly, createDeliveryNote, type BLResult } from "@/lib/shipping/bl";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

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
