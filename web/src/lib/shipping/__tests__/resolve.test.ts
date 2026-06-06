import { describe, expect, it } from "vitest";
import {
  cityKey,
  fuzzyCity,
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
