import { describe, expect, it } from "vitest";

import { ParcelStatus } from "@/generated/prisma/client";
import { mapOzonStatus, normalizeStatus } from "../ozon-status-map";

describe("normalizeStatus", () => {
  it("lowercases, strips accents, collapses whitespace", () => {
    expect(normalizeStatus("  Livré ")).toBe("livre");
    expect(normalizeStatus("EN  COURS   DE LIVRAISON")).toBe("en cours de livraison");
    expect(normalizeStatus("Retourné")).toBe("retourne");
  });
});

describe("mapOzonStatus", () => {
  it("maps known statuses (accent/case-insensitive)", () => {
    expect(mapOzonStatus("Livré")).toBe(ParcelStatus.LIVRE);
    expect(mapOzonStatus("LIVRE")).toBe(ParcelStatus.LIVRE);
    expect(mapOzonStatus("Ramassé")).toBe(ParcelStatus.RAMASSE);
    expect(mapOzonStatus("En cours de livraison")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("Retourné")).toBe(ParcelStatus.RETOURNE);
    expect(mapOzonStatus("Refusé")).toBe(ParcelStatus.REFUSE);
  });

  it("does NOT confuse 'en cours de livraison' with 'livré'", () => {
    expect(mapOzonStatus("en cours de livraison")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("en cours de livraison")).not.toBe(ParcelStatus.LIVRE);
  });

  it("fails safe on unknown / empty input (null → leave unchanged)", () => {
    expect(mapOzonStatus("Quelque chose d'inconnu")).toBeNull();
    expect(mapOzonStatus("")).toBeNull();
    expect(mapOzonStatus(null)).toBeNull();
    expect(mapOzonStatus(undefined)).toBeNull();
  });
});
