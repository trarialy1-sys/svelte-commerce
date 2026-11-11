import "server-only";

import { IntegrationProvider } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "@/lib/integrations/shopify/client";
import { computeStockState } from "@/lib/integrations/shopify/inventory";
import { planPackStock } from "./packs";

/** ON by default; `PACK_STOCK_SYNC=0` in Vercel stops it. */
export function packSyncEnabled(): boolean {
  return !/^(0|false|off|no)$/i.test(process.env.PACK_STOCK_SYNC ?? "");
}

const SET_QUANTITIES = `
mutation SetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    userErrors { field message }
  }
}`;

export interface PackSyncResult {
  enabled: boolean;
  packs: number;
  updated: { sku: string; from: number; to: number }[];
  unknown: string[];
}

/**
 * Recompute every pack's sellable quantity from its pieces (see `packs.ts`)
 * and write the changed ones to Shopify + the local mirror. Runs right after
 * the hourly catalog sync, so piece quantities are fresh. Idempotent.
 */
export async function syncPackStock(orgId: string): Promise<PackSyncResult> {
  if (!packSyncEnabled()) return { enabled: false, packs: 0, updated: [], unknown: [] };
  const odb = getOrgDb(orgId);
  const variants = await odb.variant.findMany({
    where: { status: { not: "deleted" } },
    select: {
      id: true,
      sku: true,
      inventoryQty: true,
      tracked: true,
      status: true,
      shopifyInventoryItemId: true,
    },
  });
  const plan = planPackStock(variants);
  if (plan.changes.length === 0) {
    return { enabled: true, packs: plan.packs, updated: [], unknown: plan.unknown };
  }

  const integ = await odb.integration.findUnique({
    where: { orgId_provider: { orgId, provider: IntegrationProvider.SHOPIFY } },
    select: { meta: true },
  });
  const locationId = (integ?.meta as { primaryLocationId?: string } | null)
    ?.primaryLocationId;
  const itemOf = new Map(variants.map((v) => [v.id, v.shopifyInventoryItemId]));

  const quantities = plan.changes
    .filter((c) => itemOf.get(c.id))
    .map((c) => ({
      inventoryItemId: itemOf.get(c.id)!,
      locationId,
      quantity: c.to,
    }));
  if (locationId && quantities.length > 0) {
    const { gql } = await getShopifyClient(orgId);
    for (let i = 0; i < quantities.length; i += 100) {
      const resp = await gql<{
        inventorySetQuantities: { userErrors: { message: string }[] };
      }>(SET_QUANTITIES, {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: quantities.slice(i, i + 100),
        },
      });
      const errs = resp.inventorySetQuantities?.userErrors ?? [];
      if (errs.length) {
        throw new Error(`Shopify: ${errs.map((e) => e.message).join("; ")}`);
      }
    }
  }

  for (const c of plan.changes) {
    await odb.variant.update({
      where: { id: c.id },
      data: { inventoryQty: c.to, stockState: computeStockState(c.to) },
    });
  }
  await odb.auditLog.create({
    data: {
      orgId,
      action: "stock.packs_synced",
      entity: "Variant",
      meta: { packs: plan.packs, updated: plan.changes.map((c) => `${c.sku}: ${c.from} → ${c.to}`).slice(0, 100) },
    },
  });
  return {
    enabled: true,
    packs: plan.packs,
    updated: plan.changes.map(({ sku, from, to }) => ({ sku, from, to })),
    unknown: plan.unknown,
  };
}
