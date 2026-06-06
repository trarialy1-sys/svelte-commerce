import { describe, expect, it } from "vitest";
import { normalizeShopDomain } from "@/lib/integrations/shopify";

describe("normalizeShopDomain", () => {
  it("resolves the Shopify admin URL to the myshopify domain", () => {
    expect(normalizeShopDomain("https://admin.shopify.com/store/odesma/")).toBe(
      "odesma.myshopify.com"
    );
    expect(
      normalizeShopDomain("admin.shopify.com/store/odesma/products?x=1")
    ).toBe("odesma.myshopify.com");
  });

  it("expands a bare store handle", () => {
    expect(normalizeShopDomain("odesma")).toBe("odesma.myshopify.com");
  });

  it("passes through a myshopify domain (stripping scheme/slash)", () => {
    expect(normalizeShopDomain("https://odesma.myshopify.com/")).toBe(
      "odesma.myshopify.com"
    );
    expect(normalizeShopDomain("ODESMA.myshopify.com")).toBe(
      "odesma.myshopify.com"
    );
  });

  it("keeps a custom storefront domain", () => {
    expect(normalizeShopDomain("shop.odesma.ma")).toBe("shop.odesma.ma");
  });
});
