"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { getCityResolver } from "@/lib/shipping/resolve";
import { learnCityAlias } from "@/lib/shipping/learn";
import { createParcelForOrder, type ParcelResult } from "@/lib/shipping/ozon";
import { createDeliveryNote, type BLResult } from "@/lib/shipping/bl";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

/** City detections confident enough to auto-confirm without operator review. */
const CONFIDENT = new Set(["alias", "exact", "casa", "fuzzy"]);

export interface ShipBatchResult {
  results: ParcelResult[];
  /** Parcels that went to Ozon (created OK or already existed). */
  sent: number;
  /** Parcels Ozon rejected (need a fix / manual retry). */
  failed: number;
  /** Cities we auto-resolved + saved just before sending. */
  citiesResolved: number;
  /** The single Bon de Livraison for the whole batch (null if nothing shipped). */
  bl: BLResult | null;
  /** Set when parcels were created but the BL step itself failed. */
  blError: string | null;
}

/**
 * ⚠️ LIVE one-click pipeline for a day's batch: auto-resolve the cities we can,
 * create the real OzonExpress parcels, then group them all into ONE Bon de
 * Livraison. This collapses the old resolve → send → BL steps into a single,
 * team-friendly action. Parcels that fail stay in the batch (clear per-order
 * error) and never block the BL for the ones that succeeded.
 */
export async function shipBatchAction(
  orderIds: string[],
  stock: number
): Promise<Result<ShipBatchResult>> {
  const { orgId, userId } = await requireOrgRole("operator");
  const ids = orderIds.filter((id) => typeof id === "string" && id);
  if (ids.length === 0) {
    return { ok: false, message: "Aucune commande dans ce lot." };
  }

  try {
    const odb = getOrgDb(orgId!);

    // 1) Auto-confirm the cities we're confident about, so the team doesn't have
    //    to resolve them by hand first. Low-confidence ones are left for the
    //    Livraisons page and will simply fail send with a precise message.
    const resolver = await getCityResolver(orgId!);
    const unresolved = await odb.order.findMany({
      where: { id: { in: ids }, cityId: null },
      select: { id: true, cityRaw: true, address: true },
    });
    let citiesResolved = 0;
    for (const o of unresolved) {
      const r = resolver.closest(o.cityRaw ?? "", o.address ?? "");
      if (r.cityId != null && CONFIDENT.has(r.method)) {
        await odb.order.update({ where: { id: o.id }, data: { cityId: r.cityId } });
        await learnCityAlias(orgId!, o.cityRaw ?? "", r.cityId, userId);
        citiesResolved++;
      }
    }

    // 2) Create the real parcels, one at a time (so a single failure is isolated).
    const results: ParcelResult[] = [];
    for (const id of ids) {
      results.push(
        await createParcelForOrder(orgId!, id, { stock, actorUserId: userId })
      );
    }

    // 3) Every code we can group: freshly created + already-existing at Ozon.
    const codes = [
      ...results.filter((r) => r.ok).map((r) => r.tracking!),
      ...results.filter((r) => r.usedBefore).map((r) => r.tracking || r.code),
    ].filter(Boolean);

    // 4) One BL for the whole batch. If parcels were made but the BL fails,
    //    surface it without losing the parcels (operator can rebuild the BL).
    let bl: BLResult | null = null;
    let blError: string | null = null;
    if (codes.length > 0) {
      try {
        bl = await createDeliveryNote(orgId!, codes, userId);
      } catch (e) {
        blError = e instanceof Error ? e.message : "Échec de la création du BL.";
      }
    }

    revalidatePath("/today");
    revalidatePath("/shipping");
    revalidatePath("/orders");
    revalidatePath("/dashboard");

    const sent = results.filter((r) => r.ok || r.usedBefore).length;
    return {
      ok: true,
      data: { results, sent, failed: results.length - sent, citiesResolved, bl, blError },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}
