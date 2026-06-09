import { describe, expect, it } from "vitest";
import {
  deepFindKey,
  errMsg,
  findBLRef,
  formatPhone,
  isUsedBefore,
  ozonHasError,
} from "@/lib/shipping/ozon-helpers";

describe("ozonHasError", () => {
  it("detects a nested RESULT: ERROR", () => {
    expect(ozonHasError({ "ADD-DN": { RESULT: "ERROR", MESSAGE: "x" } })).toBe(
      true
    );
    expect(ozonHasError({ "SAVE-DN": { RESULT: "SUCCESS" } })).toBe(false);
    expect(ozonHasError({ ref: "BL-1" })).toBe(false);
  });
});

describe("deepFindKey", () => {
  it("finds a nested tracking number (case-insensitive)", () => {
    const resp = {
      "ADD-PARCEL": {
        "NEW-PARCEL": { "TRACKING-NUMBER": "DES123456", "CITY_NAME": "Rabat" },
      },
      CUSTOMER: "Valid Customer",
    };
    expect(deepFindKey(resp, "TRACKING-NUMBER")).toBe("DES123456");
    expect(deepFindKey(resp, "city_name")).toBe("Rabat");
  });

  it("returns undefined when absent", () => {
    expect(deepFindKey({ a: { b: 1 } }, "tracking-number")).toBeUndefined();
  });
});

describe("errMsg", () => {
  it("reads MESSAGE next to RESULT:ERROR, ignoring the Valid Customer field", () => {
    const resp = {
      CUSTOMER: "Valid Customer",
      "ADD-PARCEL": { RESULT: "ERROR", MESSAGE: "Tracking Number Used Before" },
    };
    expect(errMsg(resp)).toBe("Tracking Number Used Before");
  });

  it("falls back when no error is present", () => {
    expect(errMsg({ RESULT: "SUCCESS" })).toBe("Erreur OzonExpress inconnue.");
  });
});

describe("isUsedBefore", () => {
  it("detects the used-before message", () => {
    expect(isUsedBefore("Tracking Number Used Before")).toBe(true);
    expect(isUsedBefore("some other error")).toBe(false);
  });
});

describe("findBLRef", () => {
  it("uses the ref field", () => {
    expect(findBLRef({ ref: "BL-2026-001" })).toBe("BL-2026-001");
  });
  it("scans values for a BL-prefixed string", () => {
    expect(findBLRef({ data: { note: "BL_99x" } })).toBe("BL_99x");
  });
});

describe("formatPhone", () => {
  it("restores/normalizes Moroccan numbers", () => {
    expect(formatPhone("612345678")).toBe("0612345678");
    expect(formatPhone("212612345678")).toBe("0612345678");
    expect(formatPhone("0612345678")).toBe("0612345678");
    expect(formatPhone("06 12 34 56 78")).toBe("0612345678");
    // +212 with a stray leading 0 on the local part (13 digits).
    expect(formatPhone("+2120662137060")).toBe("0662137060");
    expect(formatPhone("00212662137060")).toBe("0662137060");
  });
});
