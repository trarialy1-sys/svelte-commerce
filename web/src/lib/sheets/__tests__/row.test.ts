import { describe, expect, it } from "vitest";

import {
  buildOrderRow,
  parseSpreadsheetId,
  phoneCell,
  priceCell,
  productCell,
  tabRange,
} from "@/lib/sheets/row";

describe("productCell (Releasit format)", () => {
  it("joins title and variant with two spaces and a dash", () => {
    expect(productCell({ title: "Cardigan en maille", variantTitle: "S / Noir", sku: null, quantity: 1 })).toBe(
      "Cardigan en maille  - S / Noir"
    );
  });
  it("keeps the two trailing spaces when there is no variant", () => {
    expect(productCell({ title: "Bracelet perles", variantTitle: null, sku: null, quantity: 1 })).toBe("Bracelet perles  ");
    expect(productCell({ title: "Bracelet perles", variantTitle: "Default Title", sku: null, quantity: 1 })).toBe(
      "Bracelet perles  "
    );
  });
  it("shows the quantity above one", () => {
    expect(productCell({ title: "Pull", variantTitle: "M", sku: null, quantity: 2 })).toBe("Pull  - M (x2)");
  });
});

describe("phoneCell", () => {
  it("writes Moroccan numbers like Releasit", () => {
    for (const p of ["+212620944470", "0620944470", "+2120620944470", "00212620944470"]) {
      expect(phoneCell(p)).toBe("+2120620944470");
    }
  });
  it("keeps foreign numbers as they are", () => {
    expect(phoneCell("+33612345678")).toBe("+33612345678");
  });
});

describe("priceCell", () => {
  it("drops useless decimals", () => {
    expect(priceCell("329.00")).toBe("329");
    expect(priceCell("149.50")).toBe("149.5");
    expect(priceCell(198)).toBe("198");
  });
});

describe("buildOrderRow", () => {
  it("matches the sheet's column order", () => {
    const row = buildOrderRow(
      {
        name: "#79951",
        createdAt: "2026-11-12T23:30:00Z", // already 13 Nov in Casablanca (UTC+1)
        total: "527.00",
        lines: [
          { title: "Cardigan en maille", variantTitle: "S / Noir", sku: "Cardigan-Noir-S", quantity: 1 },
          { title: "Bonnet", variantTitle: null, sku: "HAT-2", quantity: 1 },
        ],
        recipient: "Test -",
        address: " bd Atlantide ",
        phone: "+212620944470",
        city: "Casablanca",
      },
      "Africa/Lagos"
    );
    expect(row).toEqual([
      "2026-11-13",
      "#79951",
      "Cardigan en maille  - S / Noir\nBonnet  ",
      "Cardigan-Noir-S\nHAT-2",
      "527",
      "Test -",
      "bd Atlantide",
      "+2120620944470",
      "Casablanca",
    ]);
  });
});

describe("parseSpreadsheetId", () => {
  it("reads ids from URLs and bare ids", () => {
    const id = "19aK-DVhcBuihVSX1eG3MuRlPQigtvuKts9-3HUNnvH8";
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(parseSpreadsheetId(id)).toBe(id);
    expect(parseSpreadsheetId("hello")).toBeNull();
  });
});

describe("tabRange", () => {
  it("quotes tab names, including trailing spaces and quotes", () => {
    expect(tabRange("Odes ")).toBe("'Odes '!A:I");
    expect(tabRange("Aly's")).toBe("'Aly''s'!A:I");
  });
});
