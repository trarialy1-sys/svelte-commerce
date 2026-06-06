import { describe, expect, it } from "vitest";
import { parseCodeSuivi, parsePrice, restorePhone } from "@/lib/orders/parse";

const KNOWN = ["NK60", "BL100-A", "BL103", "BL81", "BL100"];

describe("parseCodeSuivi", () => {
  it("splits on the last underscore → ref + SKU segment", () => {
    const r = parseCodeSuivi("NK60-BL100-A-BL103-BL81_BEN4291", KNOWN);
    expect(r.ref).toBe("BEN4291");
    expect(r.skus).toEqual(["NK60", "BL100-A", "BL103", "BL81"]);
  });

  it("never splits SKUs that contain hyphens (longest-prefix wins)", () => {
    // BL100-A must be preferred over BL100 at that position
    const r = parseCodeSuivi("BL100-A_REF1", KNOWN);
    expect(r.skus).toEqual(["BL100-A"]);
    expect(r.ref).toBe("REF1");
  });

  it("handles a code with no underscore (whole thing is ref + sku attempt)", () => {
    const r = parseCodeSuivi("NK60", KNOWN);
    expect(r.ref).toBe("NK60");
    expect(r.skus).toEqual(["NK60"]);
  });
});

describe("restorePhone", () => {
  it("re-adds the leading 0 lost in Excel export", () => {
    expect(restorePhone(612345678)).toBe("0612345678");
    expect(restorePhone("612345678")).toBe("0612345678");
  });
  it("leaves a 10-digit number with leading 0 intact", () => {
    expect(restorePhone("0612345678")).toBe("0612345678");
  });
});

describe("parsePrice", () => {
  it("parses various formats", () => {
    expect(parsePrice("1 234,50")).toBe(1234.5);
    expect(parsePrice("250 DH")).toBe(250);
    expect(parsePrice(199.9)).toBe(199.9);
    expect(parsePrice("")).toBe(0);
  });
});
