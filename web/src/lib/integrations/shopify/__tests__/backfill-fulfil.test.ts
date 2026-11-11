import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getOrgDb: vi.fn() }));
vi.mock("../client", () => ({ getShopifyClient: vi.fn() }));

import { backfillCutoff, backfillQuery, clampCutoff, MIN_AGE_DAYS } from "../backfill-fulfil";

const now = new Date("2026-11-11T22:00:00Z");

describe("backfill cut-off", () => {
  it("is 20 days back, so recent orders stay with the live rule", () => {
    expect(MIN_AGE_DAYS).toBe(20);
    expect(backfillCutoff(now)).toBe("2026-10-22");
  });
  it("can be earlier, never later", () => {
    expect(clampCutoff("2026-01-01", now)).toBe("2026-01-01");
    expect(clampCutoff("2026-11-10", now)).toBe("2026-10-22");
    expect(clampCutoff(undefined, now)).toBe("2026-10-22");
    expect(clampCutoff("nonsense", now)).toBe("2026-10-22");
  });
  it("only targets open, unfulfilled orders before the cut-off", () => {
    expect(backfillQuery("2026-10-22")).toBe("fulfillment_status:unfulfilled status:open created_at:<2026-10-22");
  });
});
