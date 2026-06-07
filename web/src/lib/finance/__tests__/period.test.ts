import { describe, expect, it } from "vitest";

import { resolvePeriod } from "../period";

const TZ = "Africa/Casablanca";

describe("resolvePeriod", () => {
  it("defaults to month", () => {
    const p = resolvePeriod(TZ, {});
    expect(p.kind).toBe("month");
    expect(p.label).toBe("Ce mois-ci");
    // month start is the 1st in local time
    expect(p.fromStr.endsWith("-01")).toBe(true);
    expect(p.from.getTime()).toBeLessThan(p.to.getTime());
  });

  it("today spans a single local day", () => {
    const p = resolvePeriod(TZ, { period: "today" });
    expect(p.kind).toBe("today");
    expect(p.granularity).toBe("day");
  });

  it("week is the last 7 days", () => {
    const p = resolvePeriod(TZ, { period: "week" });
    expect(p.kind).toBe("week");
    const days = Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000);
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("custom respects from/to and swaps if reversed", () => {
    const p = resolvePeriod(TZ, { period: "custom", from: "2026-03-10", to: "2026-03-01" });
    expect(p.kind).toBe("custom");
    expect(p.fromStr).toBe("2026-03-01");
    expect(p.toStr).toBe("2026-03-10");
  });

  it("uses week granularity for long custom ranges", () => {
    const p = resolvePeriod(TZ, { period: "custom", from: "2026-01-01", to: "2026-06-01" });
    expect(p.granularity).toBe("week");
  });

  it("uses day granularity for short ranges", () => {
    const p = resolvePeriod(TZ, { period: "custom", from: "2026-03-01", to: "2026-03-15" });
    expect(p.granularity).toBe("day");
  });

  it("falls back to month on garbage input", () => {
    expect(resolvePeriod(TZ, { period: "nonsense" }).kind).toBe("month");
  });
});
