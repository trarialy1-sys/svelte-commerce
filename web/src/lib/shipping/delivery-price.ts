import "server-only";

import { db } from "@/lib/db";
import { cityKey } from "./resolve";
import PRICES from "./data/ozon-city-prices.json";

/**
 * OzonExpress delivery price per parcel, by destination city — sourced from the
 * published OzonExpress city pricing (web/src/lib/shipping/data/ozon-city-prices.json,
 * keyed by `cityKey`-normalized city name). Most cities are the default; big
 * cities and Casablanca districts are cheaper.
 *
 * Billing rule (confirmed): the delivery fee is charged ONLY on delivered
 * parcels — a returned/refused parcel costs the return fee instead. The margin
 * engine (4.3) applies this accordingly.
 */
export const DEFAULT_DELIVERY_PRICE = 45;

const TABLE = PRICES as Record<string, number>;

/** Delivery price (DH) for a city name, falling back to the default. */
export function deliveryPriceForName(name: string | null | undefined): number {
  if (!name) return DEFAULT_DELIVERY_PRICE;
  return TABLE[cityKey(name)] ?? DEFAULT_DELIVERY_PRICE;
}

/**
 * Map every OzonExpress city id → its delivery price, resolved through the
 * global CityCatalog names. Built once per report run; parcels carry `ozonCityId`.
 */
export async function cityPriceMap(): Promise<Map<number, number>> {
  const cities = await db.cityCatalog.findMany({ select: { id: true, name: true } });
  const m = new Map<number, number>();
  for (const c of cities) m.set(c.id, deliveryPriceForName(c.name));
  return m;
}
