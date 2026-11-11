import { describe, expect, it } from "vitest";

import {
  allowedOrigins,
  amountToCents,
  centsToAmount,
  isProductEnabled,
  normalizePhone,
  parseEnabledProducts,
  validateSubmission,
} from "@/lib/cod/form";

describe("normalizePhone", () => {
  it("accepts the usual Moroccan spellings", () => {
    for (const p of ["0637682570", "637682570", "+212637682570", "00212637682570", "212 6 37 68 25 70", "06.37.68.25.70", "+2120637682570"]) {
      expect(normalizePhone(p)).toBe("+212637682570");
    }
  });
  it("accepts Arabic-Indic digits", () => {
    expect(normalizePhone("٠٦٣٧٦٨٢٥٧٠")).toBe("+212637682570");
  });
  it("rejects wrong lengths, prefixes and non-strings", () => {
    for (const p of ["063768257", "06376825700", "0137682570", "abc", "", null, 637682570]) {
      expect(normalizePhone(p)).toBeNull();
    }
  });
});

describe("validateSubmission", () => {
  const good = {
    leadId: "abcd1234efgh",
    name: " Zineb ",
    phone: "0637682570",
    city: "Temara",
    address: "1 Resd Sakia",
    items: [{ variantId: "53726964449592", quantity: 1 }],
    utm: { utm_source: "fb", junk: "x" },
    pageUrl: "https://odes.ma/products/x",
  };
  it("normalises a good submission", () => {
    const r = validateSubmission(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Zineb");
    expect(r.value.phone).toBe("+212637682570");
    expect(r.value.utm).toEqual({ utm_source: "fb" });
    expect(r.value.newsletter).toBe(false);
  });
  it("merges duplicate variants and caps quantity", () => {
    const r = validateSubmission({ ...good, items: [{ variantId: "53726964449592", quantity: 2 }, { variantId: "53726964449592", quantity: 3 }] });
    expect(r.ok && r.value.items).toEqual([{ variantId: "53726964449592", quantity: 5 }]);
    expect(validateSubmission({ ...good, items: [{ variantId: "53726964449592", quantity: 11 }] }).ok).toBe(false);
  });
  it("names the failing field", () => {
    const f = (o: object) => {
      const r = validateSubmission({ ...good, ...o });
      return r.ok ? null : r.field;
    };
    expect(f({ name: "" })).toBe("name");
    expect(f({ phone: "123" })).toBe("phone");
    expect(f({ city: "" })).toBe("city");
    expect(f({ address: "" })).toBe("address");
    expect(f({ items: [] })).toBe("items");
    expect(f({ items: [{ variantId: "x", quantity: 1 }] })).toBe("items");
    expect(f({ items: [{ variantId: "53726964449592", quantity: 0.5 }] })).toBe("items");
    expect(f({ leadId: "short" })).toBe("leadId");
  });
  it("drops a non-https page url", () => {
    const r = validateSubmission({ ...good, pageUrl: "javascript:alert(1)" });
    expect(r.ok && r.value.pageUrl).toBeNull();
  });
});

describe("config helpers", () => {
  it("enables only listed products, or all with *", () => {
    expect(parseEnabledProducts(undefined)).toEqual([]);
    const l = parseEnabledProducts(" Cardigan-en-maille , x ");
    expect(isProductEnabled(l, "cardigan-en-maille")).toBe(true);
    expect(isProductEnabled(l, "other")).toBe(false);
    expect(isProductEnabled(parseEnabledProducts("*"), "other")).toBe(true);
  });
  it("converts money without float drift", () => {
    expect(amountToCents("149.0")).toBe(14900);
    expect(amountToCents("19.99") * 3).toBe(5997);
    expect(centsToAmount(5997)).toBe("59.97");
  });
  it("lists allowed origins", () => {
    expect(allowedOrigins(undefined, "odesma.myshopify.com")).toEqual([
      "https://odes.ma",
      "https://www.odes.ma",
      "https://odesma.myshopify.com",
    ]);
  });
});
