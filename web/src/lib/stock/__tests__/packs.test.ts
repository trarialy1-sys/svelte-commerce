import { describe, expect, it } from "vitest";

import { packAvailable, packComponents, planPackStock, type PackVariant } from "../packs";

const v = (sku: string, inventoryQty: number, extra: Partial<PackVariant> = {}): PackVariant => ({
  id: sku,
  sku,
  inventoryQty,
  tracked: true,
  status: "active",
  ...extra,
});

describe("packComponents", () => {
  it("splits a pack SKU on ' + '", () => {
    expect(packComponents("hat-02-noir + hat-02-beige")).toEqual(["hat-02-noir", "hat-02-beige"]);
    expect(packComponents("hat-02-beige + CHALL-EN-BEIGE")).toEqual(["hat-02-beige", "CHALL-EN-BEIGE"]);
  });
  it("is null for a normal SKU (a bare '+' is not a pack)", () => {
    expect(packComponents("ER114")).toBeNull();
    expect(packComponents("BRA+2")).toBeNull();
  });
});

describe("packAvailable", () => {
  it("is the scarcest piece", () => {
    const stock = (k: string) => ({ a: 30, b: 8 })[k];
    expect(packAvailable(["A", "B"], stock)).toBe(8);
  });
  it("halves when the same piece is used twice", () => {
    expect(packAvailable(["A", "A"], () => 5)).toBe(2);
  });
  it("never goes below zero", () => {
    expect(packAvailable(["A", "B"], (k) => (k === "a" ? -4 : 9))).toBe(0);
  });
  it("is null when a piece is unknown", () => {
    expect(packAvailable(["A", "B"], (k) => (k === "a" ? 3 : undefined))).toBeNull();
  });
});

describe("planPackStock", () => {
  it("updates only the packs whose quantity changed", () => {
    const plan = planPackStock([
      v("hat-02-noir", 30),
      v("hat-02-bleu", 8),
      v("hat-02-noir + hat-02-bleu", 30),
      v("hat-02-noir + hat-02-noir", 15),
    ]);
    expect(plan.packs).toBe(2);
    expect(plan.changes).toEqual([{ id: "hat-02-noir + hat-02-bleu", sku: "hat-02-noir + hat-02-bleu", from: 30, to: 8 }]);
  });
  it("matches piece SKUs whatever the letter case", () => {
    const plan = planPackStock([v("HAT-02-NOIR", 4), v("chall-en-beige", 9), v("hat-02-noir + CHALL-EN-BEIGE", 0)]);
    expect(plan.changes[0].to).toBe(4);
  });
  it("leaves a pack alone when a piece is missing or its SKU is duplicated with different stock", () => {
    const plan = planPackStock([v("A", 3), v("ER159", 2), { ...v("ER159", 7), id: "dup" }, v("A + ER159", 5), v("A + ZZZ", 5)]);
    expect(plan.changes).toEqual([]);
    expect(plan.unknown).toEqual(["A + ER159", "A + ZZZ"]);
  });
  it("ignores draft/archived packs, untracked packs and deleted pieces", () => {
    const plan = planPackStock([
      v("A", 3),
      v("B", 1, { status: "deleted" }),
      v("A + B", 9),
      v("A + A", 9, { status: "draft" }),
      v("A + A ", 9, { tracked: false, id: "u" }),
    ]);
    expect(plan.packs).toBe(1);
    expect(plan.unknown).toEqual(["A + B"]);
  });
  it("an untracked piece never limits a pack", () => {
    const plan = planPackStock([v("A", 3), v("B", 0, { tracked: false }), v("A + B", 0)]);
    expect(plan.changes[0].to).toBe(3);
  });
});
