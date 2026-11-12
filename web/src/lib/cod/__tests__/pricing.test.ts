import { describe, expect, it } from "vitest";

import { defaultConfig, formOnProduct, publicConfig, sanitizeConfig, type OfferTier } from "@/lib/cod/config";
import { CUSTOM_LABEL, QUANTITY_LABEL, discountTitle, pickShipping, quoteCart, tierDiscount, type PricedVariant } from "@/lib/cod/pricing";

const tier = (t: Partial<OfferTier>): OfferTier => ({ qty: 2, type: "none", value: 0, label: "", badge: "", preselected: false, ...t });

describe("tierDiscount", () => {
  it("percent, fixed, bundle price and free pieces", () => {
    expect(tierDiscount(tier({ type: "percent", value: 20 }), [16900, 16900])).toBe(6760);
    expect(tierDiscount(tier({ type: "fixed", value: 5000 }), [16900, 16900])).toBe(5000);
    expect(tierDiscount(tier({ type: "price", value: 29900 }), [16900, 16900])).toBe(3900);
    // buy 1 get 1 free (satin dress, like #72953)
    expect(tierDiscount(tier({ type: "free", value: 1 }), [22000, 22000])).toBe(22000);
    expect(tierDiscount(tier({ type: "free", value: 1 }), [30000, 22000])).toBe(22000); // cheapest is free
    expect(tierDiscount(tier({ type: "none" }), [100])).toBe(0);
  });
  it("bundle price only covers its own pieces", () => {
    expect(tierDiscount(tier({ qty: 2, type: "price", value: 30000 }), [20000, 20000, 20000])).toBe(10000);
  });
});

describe("pickShipping", () => {
  const rates = [
    { id: "a", name: "Casablanca", priceCents: 0, minTotalCents: null, maxTotalCents: null, minQty: null, cities: ["Casablanca"] },
    { id: "b", name: "Gratuite dès 300 dh", priceCents: 0, minTotalCents: 30000, maxTotalCents: null, minQty: null, cities: [] },
    { id: "c", name: "Standard", priceCents: 3000, minTotalCents: null, maxTotalCents: null, minQty: null, cities: [] },
  ];
  it("takes the first matching rate", () => {
    expect(pickShipping(rates, 10000, 1, "casablanca", "Gratuite")).toEqual({ title: "Casablanca", cents: 0 });
    expect(pickShipping(rates, 35000, 1, "Fès", "Gratuite")).toEqual({ title: "Gratuite dès 300 dh", cents: 0 });
    expect(pickShipping(rates, 10000, 1, "Fès", "Gratuite")).toEqual({ title: "Standard", cents: 3000 });
  });
  it("is free when no rate is set", () => {
    expect(pickShipping([], 10000, 1, "Fès", "Gratuite")).toEqual({ title: "Gratuite", cents: 0 });
  });
});

describe("quoteCart", () => {
  const config = sanitizeConfig({
    enabled: true,
    products: ["robe"],
    offers: [{ id: "o1", products: ["robe"], tiers: [{ qty: 1, type: "none" }, { qty: 2, type: "free", value: 1, label: "1 + 1 offerte" }] }],
    tickUpsells: [{ id: "t1", variantId: "222222", label: "Emballage cadeau", priceCents: 1000 }],
    clickUpsells: [{ id: "c1", variantId: "333333", headline: "Le bonnet assorti", priceCents: 9900, downsell: { enabled: true, priceCents: 7900 } }],
  });
  const variants = new Map<string, PricedVariant>([
    ["111111", { variantId: "111111", priceCents: 22000, title: "Robe - S", handle: "robe", available: true }],
    ["111112", { variantId: "111112", priceCents: 22000, title: "Robe - M", handle: "robe", available: true }],
    ["222222", { variantId: "222222", priceCents: 2000, title: "Emballage", handle: "emballage", available: true }],
    ["333333", { variantId: "333333", priceCents: 14900, title: "Bonnet", handle: "bonnet", available: true }],
    ["999999", { variantId: "999999", priceCents: 5000, title: "Autre", handle: "autre", available: true }],
  ]);
  const offer = config.offers[0];
  const q = (req: Partial<Parameters<typeof quoteCart>[3]>) =>
    quoteCart(config, "robe", variants, { lines: [], tickIds: [], click: null, promo: null, city: "Casablanca", ...req }, offer, config.tickUpsells, config.clickUpsells[0]);

  it("buy 1 get 1 free across two sizes", () => {
    const r = q({ lines: [{ variantId: "111111", quantity: 1 }, { variantId: "111112", quantity: 1 }] });
    if (!r.ok) throw new Error(r.message);
    expect(r.quote.subtotalCents).toBe(44000);
    expect(r.quote.discounts).toEqual([{ label: QUANTITY_LABEL, cents: 22000 }]);
    expect(r.quote.totalCents).toBe(22000);
    expect(r.quote.tier?.label).toBe("1 + 1 offerte");
  });

  it("adds upsells at their special price as CUSTOM DISCOUNT, plus a promo code", () => {
    const r = q({
      lines: [{ variantId: "111111", quantity: 1 }],
      tickIds: ["t1"],
      click: { id: "c1", kind: "downsell" },
      promo: { code: "PROMO1", kind: "percent", value: 10, minSubtotalCents: null },
    });
    if (!r.ok) throw new Error(r.message);
    // 22000 + 2000 + 14900 = 38900; custom = 1000 + 7000 = 8000; promo 10% of 30900 = 3090
    expect(r.quote.subtotalCents).toBe(38900);
    expect(r.quote.discounts).toEqual([
      { label: CUSTOM_LABEL, cents: 8000 },
      { label: "PROMO1", cents: 3090 },
    ]);
    expect(r.quote.totalCents).toBe(27810);
    expect(discountTitle(r.quote)).toBe("CUSTOM DISCOUNT, PROMO1");
    expect(r.quote.lines.map((l) => l.kind)).toEqual(["main", "tick", "click"]);
  });

  it("refuses another product's variant, unknown ids and too many pieces", () => {
    expect(q({ lines: [{ variantId: "999999", quantity: 1 }] }).ok).toBe(false);
    expect(q({ lines: [{ variantId: "000000", quantity: 1 }] }).ok).toBe(false);
    expect(q({ lines: [{ variantId: "111111", quantity: 11 }] }).ok).toBe(false);
    expect(q({ lines: [] }).ok).toBe(false);
  });

  it("checks the promo minimum", () => {
    const r = q({ lines: [{ variantId: "111111", quantity: 1 }], promo: { code: "BIG", kind: "fixed", value: 5000, minSubtotalCents: 50000 } });
    expect(r.ok).toBe(false);
  });

  it("free-shipping codes zero the shipping", () => {
    const c2 = sanitizeConfig({ ...config, shippingRates: [{ name: "Standard", priceCents: 3000 }] });
    const r = quoteCart(c2, "robe", variants, { lines: [{ variantId: "111111", quantity: 1 }], tickIds: [], click: null, promo: { code: "FREESHIP", kind: "free_shipping", value: 0, minSubtotalCents: null }, city: "" }, null, [], null);
    if (!r.ok) throw new Error(r.message);
    expect(r.quote.shipping.cents).toBe(0);
    expect(r.quote.totalCents).toBe(22000);
  });
});

describe("config", () => {
  it("defaults keep today's behaviour from env", () => {
    const d = defaultConfig({ COD_FORM_PRODUCTS: "cardigan-en-maille", COD_FORM_PIXEL_ID: "903410907244193", COD_FORM_THANKYOU_URL: "https://odes.ma/pages/merci" });
    expect(d.enabled).toBe(true);
    expect(formOnProduct(d, "cardigan-en-maille")).toBe(true);
    expect(formOnProduct(d, "autre")).toBe(false);
    expect(d.pixels.meta).toEqual(["903410907244193"]);
    expect(d.thankYouUrl).toBe("https://odes.ma/pages/merci");
  });

  it("sanitizes untrusted input", () => {
    const c = sanitizeConfig({
      products: "Robe, *",
      colors: { primary: "red;}", radius: 99 },
      fields: [{ key: "phone", show: false, required: false }, { key: "bad" }, { key: "email", show: true, label: "Mail" }],
      thankYouUrl: "javascript:alert(1)",
      offers: [{ products: [], tiers: [{ qty: 2 }] }, { products: ["x"], tiers: [{ qty: 3, type: "free", value: 9 }, { qty: 3 }] }],
      hideSelectors: "a{} <script>",
      pixels: { meta: ["123456789", "abc"] },
    });
    expect(c.products).toEqual(["robe", "*"]);
    expect(c.colors).toEqual({ primary: "#111111", primaryText: "#ffffff", radius: 30 });
    expect(c.fields[0]).toMatchObject({ key: "phone", show: true, required: true });
    expect(c.fields.map((f) => f.key)).toEqual(["phone", "email", "name", "address", "city", "address2", "note"]);
    expect(c.thankYouUrl).toBe("");
    expect(c.offers).toHaveLength(1);
    expect(c.offers[0].tiers).toEqual([expect.objectContaining({ qty: 3, type: "free", value: 2 })]);
    expect(c.hideSelectors).not.toMatch(/[{}<>]/);
    expect(c.pixels.meta).toEqual(["123456789"]);
  });

  it("public config hides fraud lists", () => {
    const pc = publicConfig(sanitizeConfig({ enabled: true, products: ["*"], fraud: { blockedPhones: ["+212600000000"] } }), "x");
    expect(JSON.stringify(pc)).not.toContain("212600000000");
    expect(pc.enabled).toBe(true);
  });
});
