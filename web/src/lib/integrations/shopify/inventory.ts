import "server-only";

import { IntegrationProvider } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "./client";

export const LOW_STOCK_THRESHOLD = 5;

export function computeStockState(
  qty: number,
  tracked = true,
  continueSelling = false
): "RUPTURE" | "FAIBLE" | "EN_STOCK" {
  // Untracked or "continue selling when out of stock" → always available on the
  // storefront, so never show rupture regardless of the reported quantity.
  if (!tracked || continueSelling) return "EN_STOCK";
  if (qty <= 0) return "RUPTURE";
  if (qty <= LOW_STOCK_THRESHOLD) return "FAIBLE";
  return "EN_STOCK";
}

const SET_QUANTITIES = `
mutation SetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    userErrors { field message }
  }
}`;

/**
 * Set stock for variants at the org's primary location and write the change
 * back to Shopify. `rupture` → 0 (and `manualOOS`); `restock` → qty (clears
 * `manualOOS`). The Shopify push is best-effort: orgs that import via Excel (no
 * Shopify location) still get their local stock + OOS flag updated.
 */
export async function setStock(
  orgId: string,
  variantIds: string[],
  action: "rupture" | "restock",
  qty = 0
): Promise<{ updated: number }> {
  const odb = getOrgDb(orgId);

  const variants = await odb.variant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, shopifyInventoryItemId: true },
  });

  const integ = await odb.integration.findUnique({
    where: { orgId_provider: { orgId, provider: IntegrationProvider.SHOPIFY } },
    select: { meta: true },
  });
  const locationId = (integ?.meta as { primaryLocationId?: string } | null)
    ?.primaryLocationId;

  const target = action === "rupture" ? 0 : Math.max(0, Math.floor(qty));
  const manualOOS = action === "rupture";

  const quantities = variants
    .filter((v) => v.shopifyInventoryItemId)
    .map((v) => ({
      inventoryItemId: v.shopifyInventoryItemId,
      locationId,
      quantity: target,
    }));

  // Push to Shopify when connected (stops/restarts the website selling it);
  // skip silently for non-Shopify orgs so the local OOS flag still works.
  if (locationId && quantities.length > 0) {
    const { gql } = await getShopifyClient(orgId);
    const resp = await gql<{
      inventorySetQuantities: { userErrors: { message: string }[] };
    }>(SET_QUANTITIES, {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities,
      },
    });
    const errs = resp.inventorySetQuantities?.userErrors ?? [];
    if (errs.length) {
      throw new Error(`Shopify: ${errs.map((e) => e.message).join("; ")}`);
    }
  }

  const res = await odb.variant.updateMany({
    where: { id: { in: variantIds } },
    data: { inventoryQty: target, stockState: computeStockState(target), manualOOS },
  });
  return { updated: res.count };
}

const ADJUST_QUANTITIES = `
mutation AdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    userErrors { field message }
  }
}`;

export interface StockDelta {
  sku: string;
  /** Units to add (positive) or remove (negative). */
  delta: number;
}

export interface StockDeltaResult {
  sku: string;
  ok: boolean;
  delta: number;
  /** Local quantity after the change (when the SKU is known). */
  qty?: number;
  error?: string;
}

/**
 * Add / remove units by SKU (returns, corrections) — relative, so concurrent
 * sales are never overwritten. Exact SKU match only (BRA-2-L never touches
 * BRA-2-LL). Pushes to Shopify when connected (one inventoryAdjustQuantities
 * call), then mirrors the change locally. An unknown SKU is reported, never
 * guessed.
 */
export async function adjustStockBySku(
  orgId: string,
  deltas: StockDelta[],
  reason: "received" | "correction" = "correction"
): Promise<StockDeltaResult[]> {
  const odb = getOrgDb(orgId);

  // Merge duplicates (same SKU twice in one parcel).
  const merged = new Map<string, number>();
  for (const d of deltas) {
    const sku = d.sku.trim();
    if (!sku || !Number.isFinite(d.delta) || d.delta === 0) continue;
    merged.set(sku, (merged.get(sku) ?? 0) + Math.trunc(d.delta));
  }
  const skus = [...merged.keys()];
  if (skus.length === 0) return [];

  const variants = await odb.variant.findMany({
    where: { sku: { in: skus } },
    select: {
      id: true,
      sku: true,
      inventoryQty: true,
      tracked: true,
      continueSelling: true,
      shopifyInventoryItemId: true,
    },
  });
  const bySku = new Map<string, (typeof variants)[number]>();
  for (const v of variants) if (!bySku.has(v.sku)) bySku.set(v.sku, v);

  const integ = await odb.integration.findUnique({
    where: { orgId_provider: { orgId, provider: IntegrationProvider.SHOPIFY } },
    select: { meta: true },
  });
  const locationId = (integ?.meta as { primaryLocationId?: string } | null)
    ?.primaryLocationId;

  const results: StockDeltaResult[] = [];
  const changes: { inventoryItemId: string; locationId: string; delta: number }[] = [];
  for (const [sku, delta] of merged) {
    const v = bySku.get(sku);
    if (!v) {
      results.push({ sku, ok: false, delta, error: "SKU inconnu" });
      continue;
    }
    // Untracked variants always sell on Shopify: nothing to adjust there.
    if (locationId && v.shopifyInventoryItemId && v.tracked) {
      changes.push({ inventoryItemId: v.shopifyInventoryItemId, locationId, delta });
    }
    results.push({ sku, ok: true, delta });
  }

  if (changes.length > 0) {
    const { gql } = await getShopifyClient(orgId);
    const resp = await gql<{
      inventoryAdjustQuantities: { userErrors: { message: string }[] };
    }>(ADJUST_QUANTITIES, {
      input: { name: "available", reason, changes },
    });
    const errs = resp.inventoryAdjustQuantities?.userErrors ?? [];
    if (errs.length) {
      throw new Error(`Shopify: ${errs.map((e) => e.message).join("; ")}`);
    }
  }

  for (const r of results) {
    if (!r.ok) continue;
    const v = bySku.get(r.sku)!;
    const qty = v.inventoryQty + r.delta;
    await odb.variant.update({
      where: { id: v.id },
      data: {
        inventoryQty: qty,
        stockState: computeStockState(qty, v.tracked, v.continueSelling),
        ...(qty > 0 ? { manualOOS: false } : {}),
      },
    });
    r.qty = qty;
  }
  return results;
}
