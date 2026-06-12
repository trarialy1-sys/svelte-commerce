import { describe, expect, it } from "vitest";
import {
  computeProductPnl,
  type PnlParcel,
  type PnlProductMeta,
  type PnlSettings,
} from "@/lib/finance/product-pnl";

const settings: PnlSettings = {
  codCommissionPct: 5,
  returnFee: 15,
  confirmationCostPerOrder: 4,
  defaultDeliveryPrice: 45,
};
const products = new Map<string, PnlProductMeta>([
  ["A", { sku: "A", title: "Box A", landedCost: 30 }],
]);
const cityPrice = new Map<number, number>([[1, 20]]);

const item = { sku: "A", qty: 1, unitPrice: 100 };
const delivered: PnlParcel = { delivered: true, cityId: 1, items: [item] };
const returned: PnlParcel = { delivered: false, cityId: 1, items: [item] };

describe("computeProductPnl", () => {
  it("computes net with delivery/COD/confirmation on delivered, return fee on returns", () => {
    const { rows } = computeProductPnl({
      parcels: [delivered, delivered, returned],
      cityPrice,
      products,
      settings,
      adSpend: [{ sku: "A", amount: 50 }],
    });
    const a = rows.find((r) => r.sku === "A")!;
    expect(a.revenue).toBe(200);
    expect(a.cogs).toBe(60); // 2 × 30
    expect(a.delivery).toBe(40); // 2 × 20 (delivered only)
    expect(a.codCommission).toBe(10); // 5% × 200
    expect(a.confirmation).toBe(8); // 2 × 4
    expect(a.returns).toBe(15); // 1 returned parcel × 15
    expect(a.adSpend).toBe(50);
    expect(a.net).toBe(17); // 200-60-40-10-8-15-50
    expect(a.deliveredOrders).toBe(2);
    expect(a.returnedOrders).toBe(1);
    expect(a.deliveryRate).toBeCloseTo(2 / 3, 4);
    expect(a.netPerDelivered).toBe(8.5);
    expect(a.netPerShipped).toBeCloseTo(17 / 3, 2);
    // Decision guardrails: M=41/delivered, CPA=50/3, returnFee=15
    expect(a.deliveryAdjustedRoas).toBe(4); // 200 / 50
    expect(a.maxCpa).toBeCloseTo(22.33, 2); // (2/3)·41 − (1/3)·15
    expect(a.breakEvenDeliveryRate!).toBeCloseTo(0.5655, 3); // (15+CPA)/(41+15)
    expect(a.verdict).toBe("WATCH"); // net>0 but margin 8.5% < 10%
  });

  it("flags a loss-making product as KILL", () => {
    const { rows } = computeProductPnl({
      parcels: [{ delivered: true, cityId: 1, items: [{ sku: "A", qty: 1, unitPrice: 100 }] }],
      cityPrice,
      products,
      settings,
      adSpend: [{ sku: "A", amount: 200 }], // ad spend dwarfs the margin
    });
    expect(rows[0].net).toBeLessThan(0);
    expect(rows[0].verdict).toBe("KILL");
  });

  it("falls back to the default delivery price for unknown cities", () => {
    const { rows } = computeProductPnl({
      parcels: [{ delivered: true, cityId: 999, items: [item] }],
      cityPrice,
      products,
      settings,
      adSpend: [],
    });
    expect(rows[0].delivery).toBe(45); // default
  });

  it("allocates account-level ad spend by revenue share", () => {
    const products2 = new Map<string, PnlProductMeta>([
      ["A", { sku: "A", title: "A", landedCost: 0 }],
      ["B", { sku: "B", title: "B", landedCost: 0 }],
    ]);
    const { rows } = computeProductPnl({
      parcels: [
        { delivered: true, cityId: 1, items: [{ sku: "A", qty: 1, unitPrice: 300 }] },
        { delivered: true, cityId: 1, items: [{ sku: "B", qty: 1, unitPrice: 100 }] },
      ],
      cityPrice,
      products: products2,
      settings: { ...settings, codCommissionPct: 0, confirmationCostPerOrder: 0 },
      adSpend: [{ sku: null, amount: 80 }], // account-level
    });
    const a = rows.find((r) => r.sku === "A")!;
    const b = rows.find((r) => r.sku === "B")!;
    expect(a.adSpend).toBe(60); // 300/400 × 80
    expect(b.adSpend).toBe(20); // 100/400 × 80
  });

  it("totals across products", () => {
    const { totals } = computeProductPnl({
      parcels: [delivered, returned],
      cityPrice,
      products,
      settings,
      adSpend: [],
    });
    expect(totals.revenue).toBe(100);
    expect(totals.unitsDelivered).toBe(1);
    expect(totals.unitsReturned).toBe(1);
  });
});
