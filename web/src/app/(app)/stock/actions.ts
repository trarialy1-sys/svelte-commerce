"use server";

import { revalidatePath } from "next/cache";

import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";
import { setStock } from "@/lib/integrations/shopify/inventory";
import { scanImage, type ScanResult } from "@/lib/scan";

export async function setStockAction(
  variantIds: string[],
  action: "rupture" | "restock",
  qty?: number
): Promise<{ ok: boolean; updated?: number; message?: string }> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const r = await setStock(orgId!, variantIds, action, qty ?? 0);
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: action === "rupture" ? "stock.rupture" : "stock.restock",
        entity: "Variant",
        meta: { variantIds, qty: qty ?? 0, updated: r.updated },
      },
    });
    revalidatePath("/stock");
    revalidatePath("/products");
    return { ok: true, updated: r.updated };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/** Flag/unflag variants as hero (flagship/fast-moving). Operator+. */
export async function setHeroAction(
  variantIds: string[],
  hero: boolean
): Promise<{ ok: boolean; updated?: number; message?: string }> {
  const { orgId, userId } = await requireOrgRole("operator");
  if (variantIds.length === 0) return { ok: false, message: "Aucune sélection" };
  try {
    const r = await getOrgDb(orgId!).variant.updateMany({
      where: { id: { in: variantIds } },
      data: { isHero: hero },
    });
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: "stock.hero",
        entity: "Variant",
        meta: { variantIds, hero, updated: r.count },
      },
    });
    revalidatePath("/stock");
    return { ok: true, updated: r.count };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/** Set per-variant reorder threshold + lead time (drives the reorder alert). Operator+. */
export async function setReorderConfigAction(
  variantId: string,
  reorderThreshold: number | null,
  leadTimeDays: number | null
): Promise<{ ok: boolean; message?: string }> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    await getOrgDb(orgId!).variant.update({
      where: { id: variantId },
      data: {
        reorderThreshold:
          reorderThreshold != null && reorderThreshold >= 0 ? reorderThreshold : null,
        leadTimeDays: leadTimeDays != null && leadTimeDays >= 0 ? leadTimeDays : null,
      },
    });
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: "stock.reorder_config",
        entity: "Variant",
        entityId: variantId,
        meta: { reorderThreshold, leadTimeDays },
      },
    });
    revalidatePath("/stock");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

export async function deleteVariantsAction(
  variantIds: string[]
): Promise<{ ok: boolean; deleted?: number; message?: string }> {
  // Deleting catalogue rows is destructive — admin/owner only.
  const { orgId, userId } = await requireOrgRole("admin");
  if (variantIds.length === 0) return { ok: false, message: "Aucune sélection" };
  try {
    const r = await getOrgDb(orgId!).variant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: "stock.deleted",
        entity: "Variant",
        meta: { variantIds, deleted: r.count },
      },
    });
    revalidatePath("/stock");
    revalidatePath("/products");
    return { ok: true, deleted: r.count };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

export async function scanImageAction(
  imageBase64: string,
  mediaType: string
): Promise<{ ok: boolean; result?: ScanResult; message?: string }> {
  const { orgId } = await requireOrgRole("operator");
  try {
    const result = await scanImage(orgId!, imageBase64, mediaType);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Échec du scan",
    };
  }
}
