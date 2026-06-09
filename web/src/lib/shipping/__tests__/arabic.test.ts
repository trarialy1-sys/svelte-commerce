import { describe, expect, it } from "vitest";
import { arabicToLatin, hasArabic, normalizeArabic } from "@/lib/shipping/arabic";
import { cityKey, makeResolver, type CityRow } from "@/lib/shipping/resolve";

const CITIES: CityRow[] = [
  { id: 1, name: "Casablanca - Maarif" },
  { id: 2, name: "Rabat" },
  { id: 3, name: "Meknès" },
  { id: 4, name: "Marrakech" },
  { id: 5, name: "Tanger" },
  { id: 6, name: "Agadir" },
  { id: 7, name: "Béni Mellal" },
];

describe("arabicToLatin", () => {
  it("maps known Moroccan cities (dictionary)", () => {
    expect(arabicToLatin("مكناس")).toBe("meknes");
    expect(arabicToLatin("طنجة")).toBe("tanger");
    expect(arabicToLatin("الرباط")).toBe("rabat");
    expect(arabicToLatin("الدار البيضاء")).toBe("casablanca");
    expect(arabicToLatin("بني ملال")).toBe("beni mellal");
  });

  it("folds spelling variants (alef/ta-marbuta/hamza)", () => {
    expect(arabicToLatin("اكادير")).toBe("agadir");
    expect(arabicToLatin("أكادير")).toBe("agadir");
  });

  it("strips the 'ال' article for known bases", () => {
    expect(arabicToLatin("الناظور")).toBe("nador");
  });

  it("transliterates unknown words letter-by-letter", () => {
    // not a curated city — falls back to per-letter (still matchable downstream)
    expect(arabicToLatin("بلدية")).toBe("bldih");
  });

  it("returns Latin input unchanged", () => {
    expect(arabicToLatin("Casablanca")).toBe("Casablanca");
    expect(hasArabic("Casa")).toBe(false);
    expect(hasArabic("مكناس")).toBe(true);
  });

  it("normalizes harakat and tatweel", () => {
    expect(normalizeArabic("مَكْنَاس")).toBe("مكناس");
    expect(normalizeArabic("طـــنجة")).toBe("طنجه");
  });
});

describe("cityKey with Arabic", () => {
  it("transliterates before normalizing", () => {
    expect(cityKey("مكناس")).toBe("meknes");
    expect(cityKey("الدار البيضاء")).toBe("casablanca");
  });
});

describe("resolver resolves Arabic villes to the Ozon catalog", () => {
  const r = makeResolver(CITIES, new Map());

  it("exact-matches an Arabic city name against a Latin catalog", () => {
    expect(r.closest("مكناس")).toEqual({ cityId: 3, method: "exact" });
    expect(r.closest("طنجة")).toEqual({ cityId: 5, method: "exact" });
    expect(r.closest("أكادير")).toEqual({ cityId: 6, method: "exact" });
  });

  it("matches a multi-word Arabic city", () => {
    expect(r.closest("بني ملال").cityId).toBe(7);
  });

  it("routes Arabic Casablanca through the Casa path", () => {
    // "الدار البيضاء" → "casablanca": the casa branch ranks districts by address
    const res = r.closest("الدار البيضاء", "Rue 5, Maarif");
    expect(res.cityId).toBe(1);
  });
});
