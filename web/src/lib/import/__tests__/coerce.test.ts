import { describe, expect, it } from "vitest";

import { coerceCustomer, coerceOrder, coerceProduct } from "../coerce";

describe("coerceCustomer", () => {
  it("requires a phone, restores leading 0, splits tags", () => {
    expect(coerceCustomer({ name: "Ali", phone: "" }).errors).toContain("Téléphone requis");
    const ok = coerceCustomer({ name: "Ali", phone: "612345678", city: "Rabat", tags: "VIP, Fidèle" });
    expect(ok.errors).toHaveLength(0);
    expect(ok.value).toMatchObject({
      phone: "0612345678",
      name: "Ali",
      nameProvided: true,
      city: "Rabat",
      tags: ["vip", "fidèle"],
    });
  });
  it("defaults name to Client when blank (nameProvided=false)", () => {
    const r = coerceCustomer({ phone: "0612345678" });
    expect(r.value).toMatchObject({ name: "Client", nameProvided: false, tags: [] });
  });
});

describe("coerceProduct", () => {
  it("requires sku, coerces price/stock", () => {
    expect(coerceProduct({ sku: "" }).errors).toContain("SKU requis");
    const ok = coerceProduct({ sku: "ABC", title: "Tee", price: "199,90", inventoryQty: "12" });
    expect(ok.value).toMatchObject({ sku: "ABC", title: "Tee", price: 199.9, inventoryQty: 12, cost: null });
  });
  it("flags a non-numeric stock", () => {
    expect(coerceProduct({ sku: "X", inventoryQty: "abc" }).errors).toContain("Stock invalide");
  });
});

describe("coerceOrder", () => {
  const known = ["NK60", "BEN4291"];
  it("requires code + phone", () => {
    const r = coerceOrder({ code: "", phone: "" }, known);
    expect(r.errors).toEqual(expect.arrayContaining(["Référence requise", "Téléphone requis"]));
  });
  it("tokenizes SKUs against the known list", () => {
    const r = coerceOrder(
      { code: "RAB1", phone: "0612345678", customerName: "Sara", sku: "NK60BEN4291", totalPrice: "250" },
      known
    );
    expect(r.errors).toHaveLength(0);
    expect(r.value?.skus).toEqual(["NK60", "BEN4291"]);
    expect(r.value).toMatchObject({ code: "RAB1", phone: "0612345678", totalPrice: 250 });
  });
});
