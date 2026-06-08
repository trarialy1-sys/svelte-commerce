import { describe, expect, it, vi } from "vitest";

// Mock the Shopify client so no network call happens. The gql call throws the
// raw "access denied" error Shopify returns when the app lacks read_orders.
vi.mock("@/lib/integrations/shopify/client", () => ({
  getShopifyClient: vi.fn(async () => ({
    gql: vi.fn(async () => {
      throw new Error(
        "Shopify GraphQL: Access denied for orders field. Required access: `read_orders` access scope."
      );
    }),
    shopDomain: "x.myshopify.com",
    apiVersion: "2026-01",
  })),
}));

import { importShopifyOrders } from "@/lib/orders/import-shopify";

describe("importShopifyOrders", () => {
  it("maps a missing read_orders scope to a clear, actionable message", async () => {
    await expect(importShopifyOrders("org_test")).rejects.toThrow(
      /read_orders|permission de lire les commandes/i
    );
  });
});
