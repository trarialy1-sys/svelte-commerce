import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { db, getOrgDb } from "@/lib/db";
import { deliveryPriceForName, DEFAULT_DELIVERY_PRICE } from "@/lib/shipping/delivery-price";

/**
 * Product P&L engine. Net profit per product over a period, for a COD business.
 *
 * Cost timing (confirmed with the operator):
 *  - Revenue, COGS, Ozon delivery, COD commission and confirmation labour are
 *    counted on DELIVERED parcels only.
 *  - Returned/refused parcels cost the return fee.
 *  - Ad spend is prorated over the reporting window and account-level spend is
 *    allocated across products by revenue share.
 *
 * Parcel-level costs (delivery, COD commission, confirmation, return fee) are
 * attributed to the products inside each parcel by the product's revenue share
 * of that parcel (qty share for returns, which have no revenue).
 */

const DELIVERED = ParcelStatus.LIVRE;
const RETURNED: ParcelStatus[] = [ParcelStatus.RETOURNE, ParcelStatus.REFUSE];

export interface PnlSettings {
  codCommissionPct: number; // % of delivered revenue
  returnFee: number; // DH per returned/refused parcel
  confirmationCostPerOrder: number; // DH per delivered order
  defaultDeliveryPrice: number; // fallback when a city has no listed tariff
}

export interface PnlParcelItem {
  sku: string;
  qty: number;
  unitPrice: number;
}
export interface PnlParcel {
  delivered: boolean; // true = LIVRE, false = returned/refused
  cityId: number | null;
  items: PnlParcelItem[];
}
export interface PnlProductMeta {
  sku: string;
  title: string | null;
  landedCost: number; // cost + freightCost
}
/** Ad spend already prorated to the reporting window; sku null = account-level. */
export interface PnlAdSpendItem {
  sku: string | null;
  amount: number;
}

export interface ProductPnlRow {
  sku: string;
  title: string | null;
  unitsDelivered: number;
  unitsReturned: number;
  deliveredOrders: number;
  returnedOrders: number;
  deliveryRate: number; // delivered / (delivered + returned), 0..1
  revenue: number;
  cogs: number;
  delivery: number;
  returns: number;
  codCommission: number;
  adSpend: number;
  confirmation: number;
  net: number;
  margin: number; // net / revenue (0 when no revenue)
  netPerDelivered: number; // clean
  netPerShipped: number; // blended — spreads failure cost
  cpa: number; // ad spend / shipped orders
  // ── Decision guardrails (4.4) ──────────────────────────────────────────────
  /** Delivery rate at which net = 0 (null = profitable at any rate; >1 = never). */
  breakEvenDeliveryRate: number | null;
  /** Highest ad CPA the product can sustain at its current delivery rate before
   *  going to a loss (can be negative = loses money even with free ads). */
  maxCpa: number | null;
  /** True ROAS on collected (delivered) revenue, vs Meta's inflated revenue ROAS. */
  deliveryAdjustedRoas: number | null;
}

export interface ProductPnlResult {
  rows: ProductPnlRow[];
  totals: ProductPnlRow; // sku/title set to "__total__"
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure computation — no I/O, so the money math is unit-testable. */
export function computeProductPnl(input: {
  parcels: PnlParcel[];
  cityPrice: Map<number, number>;
  products: Map<string, PnlProductMeta>;
  settings: PnlSettings;
  adSpend: PnlAdSpendItem[];
}): ProductPnlResult {
  const { parcels, cityPrice, products, settings } = input;

  interface Acc {
    sku: string;
    title: string | null;
    unitsDelivered: number;
    unitsReturned: number;
    deliveredOrders: number;
    returnedOrders: number;
    revenue: number;
    cogs: number;
    delivery: number;
    returns: number;
    codCommission: number;
    adSpend: number;
    confirmation: number;
  }
  const acc = new Map<string, Acc>();
  const get = (sku: string): Acc => {
    let a = acc.get(sku);
    if (!a) {
      a = {
        sku,
        title: products.get(sku)?.title ?? null,
        unitsDelivered: 0,
        unitsReturned: 0,
        deliveredOrders: 0,
        returnedOrders: 0,
        revenue: 0,
        cogs: 0,
        delivery: 0,
        returns: 0,
        codCommission: 0,
        adSpend: 0,
        confirmation: 0,
      };
      acc.set(sku, a);
    }
    return a;
  };

  for (const p of parcels) {
    const parcelRevenue = p.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const parcelQty = p.items.reduce((s, it) => s + it.qty, 0);
    if (parcelQty === 0) continue;

    if (p.delivered) {
      const deliveryFee = cityPrice.get(p.cityId ?? -1) ?? settings.defaultDeliveryPrice;
      const codCommission = (parcelRevenue * settings.codCommissionPct) / 100;
      const confirmation = settings.confirmationCostPerOrder;
      for (const it of p.items) {
        const a = get(it.sku);
        const itemRevenue = it.qty * it.unitPrice;
        // Revenue share (fallback to qty share when the parcel has no revenue).
        const share = parcelRevenue > 0 ? itemRevenue / parcelRevenue : it.qty / parcelQty;
        a.unitsDelivered += it.qty;
        a.revenue += itemRevenue;
        a.cogs += it.qty * (products.get(it.sku)?.landedCost ?? 0);
        a.delivery += deliveryFee * share;
        a.codCommission += codCommission * share;
        a.confirmation += confirmation * share;
      }
      // Count the delivered order once, against its largest line.
      const lead = leadSku(p.items);
      if (lead) get(lead).deliveredOrders += 1;
    } else {
      for (const it of p.items) {
        const a = get(it.sku);
        const share = it.qty / parcelQty;
        a.unitsReturned += it.qty;
        a.returns += settings.returnFee * share;
      }
      const lead = leadSku(p.items);
      if (lead) get(lead).returnedOrders += 1;
    }
  }

  // Ad spend: per-product first, then allocate account-level by revenue share.
  const totalRevenue = [...acc.values()].reduce((s, a) => s + a.revenue, 0);
  let accountLevel = 0;
  for (const ad of input.adSpend) {
    if (ad.sku) get(ad.sku).adSpend += ad.amount;
    else accountLevel += ad.amount;
  }
  if (accountLevel > 0 && totalRevenue > 0) {
    for (const a of acc.values()) a.adSpend += accountLevel * (a.revenue / totalRevenue);
  }

  const rf = settings.returnFee;
  const rows = [...acc.values()]
    .map((a) => finalize(a, rf))
    .sort((x, y) => y.net - x.net);
  const totals = finalize(sumAcc([...acc.values()]), rf);
  totals.sku = "__total__";
  totals.title = "Total";
  return { rows, totals };
}

function leadSku(items: PnlParcelItem[]): string | null {
  let best: PnlParcelItem | null = null;
  for (const it of items) {
    if (!best || it.qty * it.unitPrice > best.qty * best.unitPrice) best = it;
  }
  return best?.sku ?? null;
}

function sumAcc(rows: Array<Parameters<typeof finalize>[0]>): Parameters<typeof finalize>[0] {
  const t: Parameters<typeof finalize>[0] = {
    sku: "__total__",
    title: "Total",
    unitsDelivered: 0,
    unitsReturned: 0,
    deliveredOrders: 0,
    returnedOrders: 0,
    revenue: 0,
    cogs: 0,
    delivery: 0,
    returns: 0,
    codCommission: 0,
    adSpend: 0,
    confirmation: 0,
  };
  for (const a of rows) {
    t.unitsDelivered += a.unitsDelivered;
    t.unitsReturned += a.unitsReturned;
    t.deliveredOrders += a.deliveredOrders;
    t.returnedOrders += a.returnedOrders;
    t.revenue += a.revenue;
    t.cogs += a.cogs;
    t.delivery += a.delivery;
    t.returns += a.returns;
    t.codCommission += a.codCommission;
    t.adSpend += a.adSpend;
    t.confirmation += a.confirmation;
  }
  return t;
}

function finalize(
  a: {
    sku: string;
    title: string | null;
    unitsDelivered: number;
    unitsReturned: number;
    deliveredOrders: number;
    returnedOrders: number;
    revenue: number;
    cogs: number;
    delivery: number;
    returns: number;
    codCommission: number;
    adSpend: number;
    confirmation: number;
  },
  returnFee: number
): ProductPnlRow {
  const net =
    a.revenue - a.cogs - a.delivery - a.returns - a.codCommission - a.adSpend - a.confirmation;
  const shipped = a.deliveredOrders + a.returnedOrders;
  const deliveryRate = shipped > 0 ? a.deliveredOrders / shipped : 0;

  // Decision guardrails. Per delivered order, margin before ads & return cost:
  //   M = (revenue − cogs − delivery − cod − confirmation) / deliveredOrders
  // Per shipped order:  net/ship = d·M − (1−d)·returnFee − CPA
  let breakEvenDeliveryRate: number | null = null;
  let maxCpa: number | null = null;
  if (a.deliveredOrders > 0 && shipped > 0) {
    const m =
      (a.revenue - a.cogs - a.delivery - a.codCommission - a.confirmation) /
      a.deliveredOrders;
    const cpa = a.adSpend / shipped;
    const denom = m + returnFee;
    breakEvenDeliveryRate = denom > 0 ? (returnFee + cpa) / denom : null;
    maxCpa = round2(deliveryRate * m - (1 - deliveryRate) * returnFee);
  }

  return {
    sku: a.sku,
    title: a.title,
    unitsDelivered: a.unitsDelivered,
    unitsReturned: a.unitsReturned,
    deliveredOrders: a.deliveredOrders,
    returnedOrders: a.returnedOrders,
    deliveryRate,
    revenue: round2(a.revenue),
    cogs: round2(a.cogs),
    delivery: round2(a.delivery),
    returns: round2(a.returns),
    codCommission: round2(a.codCommission),
    adSpend: round2(a.adSpend),
    confirmation: round2(a.confirmation),
    net: round2(net),
    margin: a.revenue > 0 ? net / a.revenue : 0,
    netPerDelivered: a.deliveredOrders > 0 ? round2(net / a.deliveredOrders) : 0,
    netPerShipped: shipped > 0 ? round2(net / shipped) : 0,
    cpa: shipped > 0 ? round2(a.adSpend / shipped) : 0,
    breakEvenDeliveryRate,
    maxCpa,
    deliveryAdjustedRoas: a.adSpend > 0 ? round2(a.revenue / a.adSpend) : null,
  };
}

const DAY = 86_400_000;

export interface CityPnlRow {
  cityId: number | null;
  cityName: string;
  deliveredOrders: number;
  returnedOrders: number;
  deliveryRate: number;
  revenue: number;
  net: number; // fulfillment net (excludes ad spend — ads aren't city-attributable)
  margin: number;
}

/** Net per city (fulfillment economics) — flags cities that bleed on returns. */
export function computeCityPnl(input: {
  parcels: PnlParcel[];
  cityPrice: Map<number, number>;
  products: Map<string, PnlProductMeta>;
  settings: PnlSettings;
  cityNames: Map<number, string>;
}): CityPnlRow[] {
  const { parcels, cityPrice, products, settings, cityNames } = input;
  interface C {
    cityId: number | null;
    deliveredOrders: number;
    returnedOrders: number;
    revenue: number;
    cost: number; // all costs except ad spend
  }
  const acc = new Map<string, C>();
  const key = (id: number | null) => (id == null ? "none" : String(id));

  for (const p of parcels) {
    const k = key(p.cityId);
    let c = acc.get(k);
    if (!c) {
      c = { cityId: p.cityId, deliveredOrders: 0, returnedOrders: 0, revenue: 0, cost: 0 };
      acc.set(k, c);
    }
    const parcelRevenue = p.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const cogs = p.items.reduce(
      (s, it) => s + it.qty * (products.get(it.sku)?.landedCost ?? 0),
      0
    );
    if (p.delivered) {
      const deliveryFee = cityPrice.get(p.cityId ?? -1) ?? settings.defaultDeliveryPrice;
      c.deliveredOrders += 1;
      c.revenue += parcelRevenue;
      c.cost +=
        cogs +
        deliveryFee +
        (parcelRevenue * settings.codCommissionPct) / 100 +
        settings.confirmationCostPerOrder;
    } else {
      c.returnedOrders += 1;
      c.cost += settings.returnFee;
    }
  }

  return [...acc.values()]
    .map((c) => {
      const shipped = c.deliveredOrders + c.returnedOrders;
      const net = c.revenue - c.cost;
      return {
        cityId: c.cityId,
        cityName: c.cityId != null ? cityNames.get(c.cityId) ?? `#${c.cityId}` : "Ville ?",
        deliveredOrders: c.deliveredOrders,
        returnedOrders: c.returnedOrders,
        deliveryRate: shipped > 0 ? c.deliveredOrders / shipped : 0,
        revenue: round2(c.revenue),
        net: round2(net),
        margin: c.revenue > 0 ? net / c.revenue : 0,
      };
    })
    .sort((a, b) => a.net - b.net); // worst (most negative) first
}

interface PnlInputs {
  parcels: PnlParcel[];
  cityPrice: Map<number, number>;
  cityNames: Map<number, string>;
  products: Map<string, PnlProductMeta>;
  settings: PnlSettings;
  adSpend: PnlAdSpendItem[];
}

/** Fetch everything the engine needs for a period (one round of queries). */
async function loadPnlInputs(
  orgId: string,
  period: { from: Date; to: Date }
): Promise<PnlInputs> {
  const odb = getOrgDb(orgId);
  const [settings, cities, parcels, variants, adSpends] = await Promise.all([
    odb.financeSettings.findUnique({ where: { orgId } }),
    db.cityCatalog.findMany({ select: { id: true, name: true } }),
    odb.parcel.findMany({
      where: {
        updatedAt: { gte: period.from, lte: period.to },
        status: { in: [DELIVERED, ...RETURNED] },
      },
      select: {
        status: true,
        ozonCityId: true,
        order: { select: { items: { select: { sku: true, qty: true, unitPrice: true } } } },
      },
      take: 20_000,
    }),
    odb.variant.findMany({
      select: { id: true, sku: true, title: true, cost: true, freightCost: true },
    }),
    odb.adSpend.findMany({
      where: { periodStart: { lte: period.to }, periodEnd: { gte: period.from } },
      select: { amount: true, periodStart: true, periodEnd: true, variantId: true },
    }),
  ]);

  const cityPrice = new Map<number, number>();
  const cityNames = new Map<number, string>();
  for (const c of cities) {
    cityPrice.set(c.id, deliveryPriceForName(c.name));
    cityNames.set(c.id, c.name);
  }

  const products = new Map<string, PnlProductMeta>();
  const skuByVariantId = new Map<string, string>();
  for (const v of variants) {
    skuByVariantId.set(v.id, v.sku);
    if (!products.has(v.sku)) {
      products.set(v.sku, {
        sku: v.sku,
        title: v.title,
        landedCost: Number(v.cost ?? 0) + Number(v.freightCost ?? 0),
      });
    }
  }

  const pnlParcels: PnlParcel[] = parcels
    .filter((p) => p.order != null)
    .map((p) => ({
      delivered: p.status === DELIVERED,
      cityId: p.ozonCityId,
      items: p.order!.items.map((it) => ({
        sku: it.sku,
        qty: it.qty,
        unitPrice: Number(it.unitPrice),
      })),
    }));

  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const adSpend: PnlAdSpendItem[] = adSpends.map((a) => {
    const sStart = a.periodStart.getTime();
    const sEnd = a.periodEnd.getTime();
    const spanDays = Math.max(1, Math.round((sEnd - sStart) / DAY) + 1);
    const ovStart = Math.max(sStart, fromMs);
    const ovEnd = Math.min(sEnd, toMs);
    const ovDays = ovEnd >= ovStart ? Math.round((ovEnd - ovStart) / DAY) + 1 : 0;
    return {
      sku: a.variantId ? skuByVariantId.get(a.variantId) ?? null : null,
      amount: Number(a.amount) * Math.min(1, ovDays / spanDays),
    };
  });

  const pnlSettings: PnlSettings = {
    codCommissionPct: Number(settings?.codCommissionPct ?? 0),
    returnFee: Number(settings?.returnFee ?? settings?.returnCost ?? 0),
    confirmationCostPerOrder: Number(settings?.confirmationCostPerOrder ?? 0),
    defaultDeliveryPrice: Number(settings?.shippingFeePerParcel ?? DEFAULT_DELIVERY_PRICE),
  };

  return { parcels: pnlParcels, cityPrice, cityNames, products, settings: pnlSettings, adSpend };
}

/** Product P&L for an org over a period. */
export async function getProductPnl(
  orgId: string,
  period: { from: Date; to: Date }
): Promise<ProductPnlResult> {
  const i = await loadPnlInputs(orgId, period);
  return computeProductPnl(i);
}

/** Both product + per-city P&L for the period (single fetch). */
export async function getPnl(
  orgId: string,
  period: { from: Date; to: Date }
): Promise<{ product: ProductPnlResult; cities: CityPnlRow[] }> {
  const i = await loadPnlInputs(orgId, period);
  return { product: computeProductPnl(i), cities: computeCityPnl(i) };
}
