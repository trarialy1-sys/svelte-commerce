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
