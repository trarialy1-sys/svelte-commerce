import { describe, expect, it } from "vitest";
import { parseCities } from "@/lib/shipping/cities";

describe("parseCities", () => {
  it("parses the CITIES object into id/name/region rows", () => {
    const payload = {
      CITIES: {
        "37": { ID: 37, NAME: "Rabat", REF: "RBT" },
        "40": { ID: 40, NAME: "Maarif" },
      },
    };
    const rows = parseCities(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 37, name: "Rabat", region: "RBT" });
    expect(rows[1]).toMatchObject({ id: 40, name: "Maarif", region: null });
    expect(rows[0].raw).toEqual({ ID: 37, NAME: "Rabat", REF: "RBT" });
  });

  it("falls back to the object key when ID is absent", () => {
    const rows = parseCities({ CITIES: { "12": { NAME: "Fès" } } });
    expect(rows[0]).toMatchObject({ id: 12, name: "Fès" });
  });

  it("skips entries without a usable id or name", () => {
    const rows = parseCities({
      CITIES: {
        x: { NAME: "Bad id" },
        "9": { NAME: "" },
        "10": { NAME: "Tanger" },
      },
    });
    expect(rows).toEqual([
      { id: 10, name: "Tanger", region: null, raw: { NAME: "Tanger" } },
    ]);
  });

  it("returns [] for a malformed payload", () => {
    expect(parseCities(null)).toEqual([]);
    expect(parseCities({})).toEqual([]);
    expect(parseCities({ CITIES: "nope" })).toEqual([]);
  });
});
