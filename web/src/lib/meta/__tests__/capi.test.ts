import { describe, expect, it } from "vitest";

import {
  buildPurchaseInput,
  cleanFbCookie,
  normalizeCityForMeta,
  normalizePhoneForMeta,
  purchaseEvent,
  purchaseEventId,
  sha256,
} from "@/lib/meta/capi";

describe("normalizePhoneForMeta", () => {
  it("turns Moroccan numbers into 212 + 9 digits", () => {
    for (const p of ["+212620944470", "0620944470", "+2120620944470", "00212620944470", "06 20 94 44 70"]) {
      expect(normalizePhoneForMeta(p)).toBe("212620944470");
    }
  });
  it("keeps other numbers as digits", () => {
    expect(normalizePhoneForMeta("+33 6 12 34 56 78")).toBe("33612345678");
    expect(normalizePhoneForMeta("")).toBeNull();
  });
});

describe("normalizeCityForMeta", () => {
  it("lowercases and strips accents and spaces", () => {
    expect(normalizeCityForMeta("Fès")).toBe("fes");
    expect(normalizeCityForMeta(" Sidi Bennour ")).toBe("sidibennour");
    expect(normalizeCityForMeta("--")).toBeNull();
  });
});

describe("cleanFbCookie", () => {
  it("accepts real _fbp/_fbc values only", () => {
    expect(cleanFbCookie("fb.1.1731400000000.1234567890")).toBe("fb.1.1731400000000.1234567890");
    expect(cleanFbCookie("fb.1.1731400000000.IwAR2abc_DEF-123")).toBe("fb.1.1731400000000.IwAR2abc_DEF-123");
    expect(cleanFbCookie("hello")).toBeNull();
    expect(cleanFbCookie(42)).toBeNull();
  });
});

describe("purchase event", () => {
  const input = buildPurchaseInput({
    orderName: "#79951",
    orderId: "gid://shopify/Order/1",
    totalCents: 32900,
    currency: "MAD",
    variantIds: ["123456789"],
    numItems: 1,
    phone: "+212620944470",
    city: "Casablanca",
    ip: "105.155.152.176",
    userAgent: "Mozilla/5.0",
    fbp: "fb.1.1731400000000.1234567890",
    fbc: "bad",
    sourceUrl: "https://odes.ma/products/cardigan-en-maille",
    now: new Date("2026-11-12T12:00:00Z"),
  });

  it("hashes personal data before it leaves the request", () => {
    expect(input.phoneHash).toBe(sha256("212620944470"));
    expect(input.cityHash).toBe(sha256("casablanca"));
    expect(JSON.stringify(input)).not.toContain("620944470");
    expect(input.fbc).toBeNull();
  });

  it("uses the same event id as the browser pixel", () => {
    const e = purchaseEvent(input);
    expect(e.event_id).toBe(purchaseEventId("#79951"));
    expect(e.event_id).toBe("odc_#79951");
    expect(e.event_name).toBe("Purchase");
    expect(e.action_source).toBe("website");
    expect(e.event_time).toBe(1794484800);
    expect(e.custom_data).toMatchObject({ value: 329, currency: "MAD", content_ids: ["123456789"], order_id: "#79951" });
    expect(e.user_data).toMatchObject({
      ph: [input.phoneHash],
      external_id: [input.phoneHash],
      ct: [input.cityHash],
      country: [sha256("ma")],
      client_ip_address: "105.155.152.176",
      client_user_agent: "Mozilla/5.0",
      fbp: "fb.1.1731400000000.1234567890",
    });
    expect(e.user_data).not.toHaveProperty("fbc");
  });
});
