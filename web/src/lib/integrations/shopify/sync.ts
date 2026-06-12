import "server-only";

import { IntegrationProvider } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "./client";
import { computeStockState } from "./inventory";

interface LocationsResp {
  locations: { nodes: { id: string; isActive: boolean }[] };
}

interface VariantNode {
  id: string;
  sku: string | null;
  price: string;
  inventoryQuantity: number | null;
  inventoryItem: { id: string; tracked: boolean | null } | null;
}
interface ProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredImage: { url: string } | null;
  variants: { nodes: VariantNode[] };
}
interface ProductsResp {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ProductNode[];
  };
}

const PRODUCTS_QUERY = `
query Products($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle status
      featuredImage { url }
      variants(first: 100) {
        nodes { id sku price inventoryQuantity inventoryItem { id tracked } }
      }
    }
  }
}`;

/** Pull the org's Shopify catalog into Product/Variant (org-scoped). */
export async function syncCatalog(
  orgId: string
): Promise<{ products: number; variants: number }> {
  const { gql } = await getShopifyClient(orgId);
  const odb = getOrgDb(orgId);

  // Primary (first active) location.
  const loc = await gql<LocationsResp>(
    `{ locations(first: 20) { nodes { id isActive } } }`
  );
  const primary =
    loc.locations.nodes.find((n) => n.isActive) ?? loc.locations.nodes[0];
  const primaryLocationId = primary?.id ?? null;

  let cursor: string | null = null;
  let products = 0;
  let variants = 0;

  do {
    const resp: ProductsResp = await gql<ProductsResp>(PRODUCTS_QUERY, {
      cursor,
    });
    for (const p of resp.products.nodes) {
      const status = p.status.toLowerCase();
      const product = await odb.product.upsert({
        where: { orgId_shopifyId: { orgId, shopifyId: p.id } },
        create: {
          orgId,
          shopifyId: p.id,
          title: p.title,
          handle: p.handle,
          status,
          imageUrl: p.featuredImage?.url ?? null,
        },
        update: {
          title: p.title,
          handle: p.handle,
          status,
          imageUrl: p.featuredImage?.url ?? null,
        },
        select: { id: true },
      });
      products++;

      for (const v of p.variants.nodes) {
        const qty = v.inventoryQuantity ?? 0;
        // Shopify "tracked = false" → always available on the site, so it must
        // not show as out of stock here regardless of the reported quantity.
        const tracked = v.inventoryItem?.tracked ?? true;
        await odb.variant.upsert({
          where: { orgId_shopifyVariantId: { orgId, shopifyVariantId: v.id } },
          create: {
            orgId,
            productId: product.id,
            shopifyVariantId: v.id,
            shopifyInventoryItemId: v.inventoryItem?.id ?? null,
            sku: v.sku || v.id,
            price: v.price ?? "0",
            inventoryQty: qty,
            tracked,
            title: p.title,
            status,
            stockState: computeStockState(qty, tracked),
          },
          update: {
            productId: product.id,
            shopifyInventoryItemId: v.inventoryItem?.id ?? null,
            sku: v.sku || v.id,
            price: v.price ?? "0",
            inventoryQty: qty,
            tracked,
            title: p.title,
            status,
            stockState: computeStockState(qty, tracked),
          },
        });
        variants++;
      }
      if (p.variants.nodes.length >= 100) {
        console.warn(
          `[sync] product ${p.id} has >=100 variants; variant pagination skipped.`
        );
      }
    }
    cursor = resp.products.pageInfo.hasNextPage
      ? resp.products.pageInfo.endCursor
      : null;
  } while (cursor);

  // Persist primary location + last sync time in Integration.meta.
  const existing = await odb.integration.findUnique({
    where: { orgId_provider: { orgId, provider: IntegrationProvider.SHOPIFY } },
    select: { meta: true },
  });
  const meta = {
    ...((existing?.meta as Record<string, unknown> | null) ?? {}),
    primaryLocationId,
    lastCatalogSyncAt: new Date().toISOString(),
  };
  await odb.integration.update({
    where: { orgId_provider: { orgId, provider: IntegrationProvider.SHOPIFY } },
    data: { meta },
  });

  return { products, variants };
}
