"use server";

import { revalidatePath } from "next/cache";

import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";
import { learnCityAlias } from "@/lib/shipping/learn";

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
