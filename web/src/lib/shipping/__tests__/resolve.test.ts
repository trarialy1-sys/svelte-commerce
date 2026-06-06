import { describe, expect, it } from "vitest";
import {
  cityKey,
  fuzzyCity,
  levenshtein,
  makeResolver,
  type CityRow,
} from "@/lib/shipping/resolve";

const CITIES: CityRow[] = [
  { id: 1, name: "Casablanca - Maarif" },
  { id: 2, name: "Casablanca - Ain Chock" },
  { id: 3, name: "Rabat" },
  { id: 4, name: "Marrakech" },
  { id: 5, name: "Fès" },
  { id: 6, name: "Ben Guerir" },
];

describe("cityKey", () => {
  it("strips diacritics, lowercases, collapses punctuation", () => {
    expect(cityKey("Fès")).toBe("fes");
    expect(cityKey("  Salé–Médina ")).toBe("sale medina");
  });
});

describe("resolver", () => {
  const r = makeResolver(CITIES, new Map([["temra", 3]]));

  it("uses a learned alias first", () => {
    expect(r.resolve("Temra").method).toBe("alias");
    expect(r.resolve("Temra").cityId).toBe(3);
  });

  it("exact-matches a catalog name", () => {
    expect(r.resolve("rabat")).toEqual({ cityId: 3, method: "exact" });
    expect(r.resolve("Fès")).toEqual({ cityId: 5, method: "exact" });
  });

  it("resolves a Casa district named directly in the ville", () => {
    expect(r.resolve("Maarif")).toEqual({ cityId: 1, method: "casa" });
  });

  it("uses the address for Casa-family villes", () => {
    expect(r.resolve("Casa", "Rue 12, Ain Chock")).toEqual({
      cityId: 2,
      method: "casa",
    });
  });

  it("never reads the address for non-Casa villes (no bleed)", () => {
    // ville is unknown + single-token, address mentions a Casa district —
    // must NOT resolve to that district.
    expect(r.resolve("Temaraa", "Rue 9, Maarif").cityId).toBeNull();
  });

  it("fuzzy-matches multi-token villes by token-subset (not exact)", () => {
    // reordered tokens -> not an exact key, but both are substrings of the name
    expect(r.resolve("guerir ben")).toEqual({ cityId: 6, method: "fuzzy" });
  });
});

describe("fuzzyCity", () => {
  it("requires at least two tokens", () => {
    expect(fuzzyCity(CITIES, "rabatt")).toBeNull(); // single token -> no fuzzy
    expect(fuzzyCity(CITIES, "ben guerir")).toBe(6);
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("rabat", "rabatt")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });
});

describe("closest (always-on suggestion)", () => {
  const r = makeResolver(CITIES, new Map());

  it("prefers a confident resolve when available", () => {
    expect(r.closest("rabat")).toEqual({ cityId: 3, method: "exact" });
  });

  it("suggests the nearest city for a single-token typo (approx)", () => {
    // 'rabatt' would not fuzzy-match, but closest returns Rabat
    expect(r.closest("rabatt")).toEqual({ cityId: 3, method: "approx" });
  });

  it("ranks Casa districts by the address when the ville is just 'Casa'", () => {
    // address token 'chok' is one edit from district 'chock'
    const res = r.closest("Casablanca", "Rue 5, Ain Chok");
    expect(res.cityId).toBe(2); // Casablanca - Ain Chock
  });

  it("always returns a best-effort id rather than nothing", () => {
    expect(r.closest("Marakech").cityId).toBe(4); // typo -> Marrakech
  });
});
