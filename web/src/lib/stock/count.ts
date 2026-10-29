import "server-only";

import { getOrgDb } from "@/lib/db";
import { adjustStockBySku, setStock } from "@/lib/integrations/shopify/inventory";

/**
 * Physical count (« Comptage », ported from the Google Sheet mobile app): the
 * counted quantity becomes the stock (Shopify + local); 0 = rupture. Records
 * who counted, when, and an optional remark.
 */
export async function saveCount(
  orgId: string,
  input: { variantId: string; qty: number; by: string; note?: string | null },
  actorUserId: string | null
): Promise<{ qty: number }> {
  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty < 0) throw new Error("Quantité invalide.");
  const by = input.by.trim();
  if (!by) throw new Error("Écris ton prénom d'abord.");

  const odb = getOrgDb(orgId);
  const v = await odb.variant.findUnique({
    where: { id: input.variantId },
    select: { id: true, sku: true, inventoryQty: true },
  });
  if (!v) throw new Error("Article introuvable.");

  await setStock(orgId, [v.id], qty > 0 ? "restock" : "rupture", qty);
  await odb.variant.update({
    where: { id: v.id },
    data: {
      lastCountedAt: new Date(),
      lastCountedBy: by.slice(0, 60),
      ...(input.note != null ? { countNote: input.note.trim().slice(0, 500) || null } : {}),
    },
  });
  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "stock.counted",
      entity: "Variant",
      entityId: v.id,
      meta: { sku: v.sku, before: v.inventoryQty, counted: qty, by, note: input.note ?? null },
    },
  });
  return { qty };
}

/** Save only a remark (no quantity change). */
export async function saveCountNote(
  orgId: string,
  variantId: string,
  note: string
): Promise<void> {
  await getOrgDb(orgId).variant.update({
    where: { id: variantId },
    data: { countNote: note.trim().slice(0, 500) || null },
  });
}

/**
 * Arrivage (réassort): pieces received from the supplier are ADDED to the
 * current stock (relative — never overwrites concurrent sales).
 */
export async function addArrival(
  orgId: string,
  input: { variantId: string; qty: number; by: string },
  actorUserId: string | null
): Promise<{ qty: number | undefined }> {
  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantité arrivée invalide.");
  const by = input.by.trim();
  if (!by) throw new Error("Écris ton prénom d'abord.");
  const odb = getOrgDb(orgId);
  const v = await odb.variant.findUnique({
    where: { id: input.variantId },
    select: { id: true, sku: true },
  });
  if (!v) throw new Error("Article introuvable.");
  const [r] = await adjustStockBySku(orgId, [{ sku: v.sku, delta: qty }], "received");
  if (!r?.ok) throw new Error(r?.error ?? "Échec.");
  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "stock.arrival",
      entity: "Variant",
      entityId: v.id,
      meta: { sku: v.sku, added: qty, by },
    },
  });
  return { qty: r.qty };
}
