import { describe, expect, it } from "vitest";

import { renderDigest } from "../email";
import type { DigestSummary } from "../summary";

function summary(over: Partial<DigestSummary> = {}): DigestSummary {
  return {
    date: "2026-06-06",
    org: { name: "Acme", logoUrl: null, brandColor: "#C1542D", currency: "MAD", locale: "fr" },
    pulse: { newOrders: 5, confirmed: 3, shipped: 2, delivered: 1, returns: 0 },
    attention: { aConfirmer: 4, problemes: 1, oos: 2, aReappro: 3 },
    cod: { livreAEncaisser: 990, enAttente: 990 },
    isEmpty: false,
    ...over,
  };
}

describe("renderDigest", () => {
  it("subject carries date + org name", () => {
    const r = renderDigest(summary(), "https://app.test");
    expect(r.subject).toBe("Résumé du 2026-06-06 · Acme");
  });

  it("embeds absolute deep links for action items", () => {
    const r = renderDigest(summary(), "https://app.test");
    expect(r.html).toContain("https://app.test/orders?status=NOUVELLE");
    expect(r.html).toContain("https://app.test/stock?stockState=RUPTURE");
    expect(r.text).toContain("https://app.test/dashboard");
  });

  it("DH-formats COD and includes the figures", () => {
    const r = renderDigest(summary(), "https://app.test");
    expect(r.html).toContain("990,00 DH");
    expect(r.text).toContain("990,00 DH");
  });

  it("localizes to English when org locale is en", () => {
    const r = renderDigest(summary({ org: { name: "Acme", logoUrl: null, brandColor: "#000", currency: "MAD", locale: "en" } }), "https://app.test");
    expect(r.subject.startsWith("Summary for")).toBe(true);
    expect(r.html).toContain("New orders");
  });
});
