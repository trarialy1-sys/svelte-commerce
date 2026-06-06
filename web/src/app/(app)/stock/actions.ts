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
