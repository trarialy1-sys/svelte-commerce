import { describe, expect, it } from "vitest";
import { tokenizeSku } from "@/lib/catalog/tokenize";

const KNOWN = ["ABC-1", "ABC-2", "ABC-10", "XYZ-100", "TSHIRT-RED-M"];

describe("tokenizeSku", () => {
  it("matches an exact SKU (case/space-insensitive)", () => {
    expect(tokenizeSku("ABC-1", KNOWN)).toEqual(["ABC-1"]);
    expect(tokenizeSku("  abc-1 ", KNOWN)).toEqual(["ABC-1"]);
  });

  it("never splits naïvely on hyphens", () => {
    expect(tokenizeSku("TSHIRT-RED-M", KNOWN)).toEqual(["TSHIRT-RED-M"]);
  });

  it("decomposes concatenated SKUs (longest-prefix, greedy)", () => {
    expect(tokenizeSku("ABC-1ABC-2", KNOWN)).toEqual(["ABC-1", "ABC-2"]);
    // ABC-10 must win over ABC-1 at that position
    expect(tokenizeSku("ABC-10XYZ-100", KNOWN)).toEqual(["ABC-10", "XYZ-100"]);
  });

  it("tolerates light OCR noise via fuzzy match", () => {
    // missing hyphen
    expect(tokenizeSku("ABC1", KNOWN)).toEqual(["ABC-1"]);
    // one wrong char
    expect(tokenizeSku("XYZ-1O0", KNOWN)).toEqual(["XYZ-100"]);
  });

  it("returns nothing for unknown codes", () => {
    expect(tokenizeSku("ZZZ-9", KNOWN)).toEqual([]);
    expect(tokenizeSku("", KNOWN)).toEqual([]);
  });
});
