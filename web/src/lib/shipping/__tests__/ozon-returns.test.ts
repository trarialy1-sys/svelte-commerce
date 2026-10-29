import { describe, expect, it } from "vitest";

import { ParcelStatus } from "@/generated/prisma/client";
import { isReturnReceived, mapOzonStatus } from "../ozon-status-map";
import { cleanOzonComment, OzonKeyError, parseTracking } from "../ozon-tracking";
import { candidateCodes, sheetCity3 } from "../ozon-codes";

describe("mapOzonStatus — live Ozon vocabulary", () => {
  it("maps the statuses seen in real tracking histories", () => {
    expect(mapOzonStatus("Nouveau Colis")).toBe(ParcelStatus.CREE);
    expect(mapOzonStatus("Attente De Ramassage")).toBe(ParcelStatus.CREE);
    expect(mapOzonStatus("Ramassé")).toBe(ParcelStatus.RAMASSE);
    expect(mapOzonStatus("Expédié")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("Mise en distribution")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("Pas de réponse + SMS")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("Pas de réponse J+3")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("pas réponse +déplacement")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("Reporté")).toBe(ParcelStatus.EN_TRANSIT);
    expect(mapOzonStatus("Livré")).toBe(ParcelStatus.LIVRE);
    expect(mapOzonStatus("Refusé")).toBe(ParcelStatus.REFUSE);
    expect(mapOzonStatus("Retourné")).toBe(ParcelStatus.RETOURNE);
  });

  it("'Reçu' = at the delivery agency (after Expédié), not a new parcel", () => {
    expect(mapOzonStatus("Reçu")).toBe(ParcelStatus.EN_TRANSIT);
  });
});

describe("isReturnReceived", () => {
  it("is true only for Retourné + « Reçu par client »", () => {
    expect(isReturnReceived("Retourné", "Reçu par client")).toBe(true);
    expect(isReturnReceived("Retourné", "Reçu par Agence GRAND CASA")).toBe(false);
    expect(isReturnReceived("Retourné", "Preparation Retour .2")).toBe(false);
    expect(isReturnReceived("Refusé", "Reçu par client")).toBe(false);
    expect(isReturnReceived("Retourné", null)).toBe(false);
  });
});

describe("parseTracking", () => {
  const live = {
    CHECK_API: { RESULT: "SUCCESS", MESSAGE: "Valide API Key" },
    TRACKING: {
      "TRACKING-NUMBER": "BRA-2-LL_KHO4162",
      RESULT: "SUCCESS",
      HISTORY: {
        "1": { STATUT: "Nouveau Colis", TIME: "1791471804", TIME_STR: "2026-10-08 15:03", COMMENT: "" },
        "2": { STATUT: "Refusé", TIME: "1792073541", TIME_STR: "2026-10-15 14:12", COMMENT: "" },
        "3": { STATUT: "Retourné", TIME: "1793196181", TIME_STR: "2026-10-28 14:03", COMMENT: " | Commentaire: Reçu par client" },
      },
      LAST_TRACKING: { STATUT: "Retourné", TIME: "1793196181", TIME_STR: "2026-10-28 14:03", COMMENT: "| Commentaire: Reçu par client" },
    },
  };

  it("reads the last event, its cleaned comment and the creation time", () => {
    expect(parseTracking(live)).toEqual({
      status: "Retourné",
      comment: "Reçu par client",
      eventAt: "2026-10-28 14:03",
      createdAt: "2026-10-08 15:03",
    });
  });

  it("returns null for a code Ozon doesn't know (key OK, tracking ERROR)", () => {
    expect(
      parseTracking({
        CHECK_API: { RESULT: "SUCCESS" },
        TRACKING: { RESULT: "ERROR", MESSAGE: "Invalid tracking number" },
      })
    ).toBeNull();
  });

  it("throws on a rejected API key", () => {
    expect(() => parseTracking({ CHECK_API: { RESULT: "ERROR", MESSAGE: "bad key" } })).toThrow(OzonKeyError);
  });

  it("cleans HTML and prefixes from comments", () => {
    expect(cleanOzonComment("| Livreur: Yassine <b>x</b> | Commentaire: Reçu par client")).toBe(
      "Livreur: Yassine x Reçu par client"
    );
  });
});

describe("candidateCodes (Google Sheet export)", () => {
  it("builds SKUs-collés + city3 + last 4 digits, then one per item", () => {
    expect(
      candidateCodes({ skus: ["NK123", "BL70"], cityRaw: "Settat", phone: "0713191455" })
    ).toEqual(["NK123BL70_SET1455", "NK123_SET1455", "BL70_SET1455"]);
    expect(
      candidateCodes({ skus: ["BRA-2-LL"], cityRaw: " Khouribga", phone: "+2120660624162" })
    ).toEqual(["BRA-2-LL_KHO4162"]);
  });

  it("keeps the sheet's raw uppercase city (accents, Arabic)", () => {
    expect(sheetCity3("Fès")).toBe("FÈS");
    expect(sheetCity3("الرباط")).toBe("الر");
  });

  it("needs a phone and at least one SKU", () => {
    expect(candidateCodes({ skus: [], cityRaw: "Rabat", phone: "0600000000" })).toEqual([]);
    expect(candidateCodes({ skus: ["X"], cityRaw: "Rabat", phone: "" })).toEqual([]);
  });
});
