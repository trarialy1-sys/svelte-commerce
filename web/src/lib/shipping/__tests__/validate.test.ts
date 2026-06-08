import { describe, expect, it } from "vitest";

import { missingShippingFields } from "../validate";

const ok = {
  customerName: "Samira",
  phone: "0669019395",
  address: "Rue de la pharmacie",
  price: 189,
};

describe("missingShippingFields", () => {
  it("returns no missing fields for a complete order", () => {
    expect(missingShippingFields(ok)).toEqual([]);
  });

  it("flags an empty receiver name", () => {
    expect(missingShippingFields({ ...ok, customerName: "  " })).toContain(
      "destinataire"
    );
    expect(missingShippingFields({ ...ok, customerName: null })).toContain(
      "destinataire"
    );
  });

  it("flags a missing or invalid phone", () => {
    expect(missingShippingFields({ ...ok, phone: "" })).toContain("téléphone");
    expect(missingShippingFields({ ...ok, phone: "123" })).toContain(
      "téléphone"
    );
  });

  it("accepts the +212 / 9-digit phone forms (normalized to 0…)", () => {
    expect(missingShippingFields({ ...ok, phone: "212669019395" })).toEqual([]);
    expect(missingShippingFields({ ...ok, phone: "669019395" })).toEqual([]);
  });

  it("flags an empty address", () => {
    expect(missingShippingFields({ ...ok, address: "" })).toContain("adresse");
  });

  it("flags a non-positive price", () => {
    expect(missingShippingFields({ ...ok, price: 0 })).toContain("prix");
  });

  it("lists every missing field at once", () => {
    expect(
      missingShippingFields({
        customerName: "",
        phone: "",
        address: "",
        price: 0,
      })
    ).toEqual(["destinataire", "téléphone", "adresse", "prix"]);
  });
});
