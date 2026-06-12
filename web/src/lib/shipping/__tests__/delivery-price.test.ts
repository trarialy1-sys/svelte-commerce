import { describe, expect, it } from "vitest";
import { DEFAULT_DELIVERY_PRICE, deliveryPriceForName } from "@/lib/shipping/delivery-price";

describe("deliveryPriceForName", () => {
  it("prices Casablanca and its districts cheapest", () => {
    expect(deliveryPriceForName("Casablanca")).toBe(20);
    // catalog uses a hyphen, the table an en-dash — cityKey normalizes both
    expect(deliveryPriceForName("Casablanca - Maarif")).toBe(20);
  });

  it("prices the big cities at their tier (accent-insensitive)", () => {
    expect(deliveryPriceForName("Rabat")).toBe(35);
    expect(deliveryPriceForName("Marrakech")).toBe(35);
    expect(deliveryPriceForName("Béni Mellal")).toBe(40);
  });

  it("falls back to the default for unlisted / empty cities", () => {
    expect(deliveryPriceForName("Oujda")).toBe(45);
    expect(deliveryPriceForName("Un Village Inconnu")).toBe(DEFAULT_DELIVERY_PRICE);
    expect(deliveryPriceForName(null)).toBe(DEFAULT_DELIVERY_PRICE);
    expect(deliveryPriceForName("")).toBe(DEFAULT_DELIVERY_PRICE);
  });
});
