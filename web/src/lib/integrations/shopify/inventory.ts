import "server-only";

import { IntegrationProvider } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "./client";

export const LOW_STOCK_THRESHOLD = 5;

export function computeStockState(qty: number): "RUPTURE" | "FAIBLE" | "EN_STOCK" {
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
 * back to Shopify. `rupture` → 0; `restock` → qty. Updates local Variant rows.
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
  if (!locationId) {
    throw new Error(
      "Emplacement Shopify introuvable — lancez d'abord une synchronisation."
    );
  }

  const target = action === "rupture" ? 0 : Math.max(0, Math.floor(qty));

  const quantities = variants
    .filter((v) => v.shopifyInventoryItemId)
    .map((v) => ({
      inventoryItemId: v.shopifyInventoryItemId,
      locationId,
      quantity: target,
    }));

  if (quantities.length > 0) {
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
    data: { inventoryQty: target, stockState: computeStockState(target) },
  });
  return { updated: res.count };
}
