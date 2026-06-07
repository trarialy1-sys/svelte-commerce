import { describe, expect, it } from "vitest";

import { returnRate, returnState } from "../aggregates";
import { buildCustomerWhere } from "@/modules/customers/list";
import type { ListParams } from "@/lib/module/types";

const agg = (delivered: number, returned: number, codDelivered = 0) => ({
  delivered,
  returned,
  codDelivered,
});

describe("returnRate", () => {
  it("guards divide-by-zero (no parcels)", () => {
    expect(returnRate(agg(0, 0))).toBe(0);
  });
  it("returned / (delivered + returned)", () => {
    expect(returnRate(agg(3, 1))).toBeCloseTo(0.25);
    expect(returnRate(agg(0, 2))).toBe(1);
  });
});

describe("returnState", () => {
  it("none when no delivered/returned", () => {
    expect(returnState(agg(0, 0))).toBe("none");
  });
  it("ok below 30%", () => {
    expect(returnState(agg(9, 1))).toBe("ok"); // 10%
  });
  it("probleme at/above 30%", () => {
    expect(returnState(agg(2, 1))).toBe("probleme"); // 33%
  });
});

function params(over: Partial<ListParams> = {}): ListParams {
  return {
    page: 1,
    pageSize: 25,
    q: "",
    sortField: "lastOrderAt",
    sortDir: "desc",
    filters: {},
    ...over,
  };
}

describe("buildCustomerWhere", () => {
  it("empty params → empty where", () => {
    expect(buildCustomerWhere(params())).toEqual({});
  });
  it("search builds an OR over name/phone/city", () => {
    const w = buildCustomerWhere(params({ q: "amine" }));
    expect(w.AND).toBeTruthy();
    const or = (w.AND as { OR?: unknown[] }[])[0].OR;
    expect(or).toHaveLength(3);
  });
  it("blocked filter maps to isBlocked", () => {
    expect(buildCustomerWhere(params({ filters: { blocked: "true" } }))).toEqual({
      AND: [{ isBlocked: true }],
    });
  });
  it("hasReturns filter targets returned/refused parcels", () => {
    const w = buildCustomerWhere(params({ filters: { hasReturns: "true" } }));
    const clause = (w.AND as Record<string, unknown>[])[0];
    expect(clause).toHaveProperty("orders");
  });
  it("tag filter uses array has; city filter equals", () => {
    const w = buildCustomerWhere(params({ filters: { tag: "vip", city: "Casablanca" } }));
    expect(w.AND).toEqual([{ city: "Casablanca" }, { tags: { has: "vip" } }]);
  });
});
