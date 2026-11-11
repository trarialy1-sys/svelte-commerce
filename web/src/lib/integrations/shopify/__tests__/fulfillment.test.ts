import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getOrgDb: vi.fn() }));
vi.mock("../client", () => ({ getShopifyClient: vi.fn() }));

import { ParcelStatus } from "@/generated/prisma/client";
import { decideFulfilment, fulfilOnShipEnabled, isShipped } from "../fulfillment";

describe("decideFulfilment", () => {
  it("fulfils every open fulfillment order", () => {
    expect(
      decideFulfilment({
        fulfillmentOrders: { nodes: [{ id: "a", status: "OPEN" }, { id: "b", status: "CLOSED" }, { id: "c", status: "IN_PROGRESS" }] },
      })
    ).toEqual({ outcome: "FULFILL", ids: ["a", "c"] });
  });
  it("does nothing when the order is already fulfilled", () => {
    expect(decideFulfilment({ fulfillmentOrders: { nodes: [{ id: "a", status: "CLOSED" }] } })).toEqual({ outcome: "NOTHING_OPEN" });
  });
  it("never fulfils a cancelled or missing order", () => {
    expect(decideFulfilment({ cancelledAt: "2026-11-01T10:00:00Z", fulfillmentOrders: { nodes: [{ id: "a", status: "OPEN" }] } })).toEqual({ outcome: "CANCELLED" });
    expect(decideFulfilment(null)).toEqual({ outcome: "NOT_FOUND" });
  });
});

describe("fulfilOnShipEnabled", () => {
  it("is off unless switched on", () => {
    delete process.env.FULFILL_ON_SHIP;
    expect(fulfilOnShipEnabled()).toBe(false);
    process.env.FULFILL_ON_SHIP = "1";
    expect(fulfilOnShipEnabled()).toBe(true);
    delete process.env.FULFILL_ON_SHIP;
  });
});

describe("isShipped", () => {
  it("a parcel only created at Ozon is not shipped (item may turn out to be out of stock)", () => {
    expect(isShipped(ParcelStatus.CREE)).toBe(false);
  });
  it("picked up or any later state counts as shipped", () => {
    for (const st of [ParcelStatus.RAMASSE, ParcelStatus.EN_TRANSIT, ParcelStatus.LIVRE, ParcelStatus.REFUSE, ParcelStatus.RETOURNE]) {
      expect(isShipped(st)).toBe(true);
    }
  });
});
