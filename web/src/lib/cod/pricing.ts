/**
 * COD-form pricing — the one place that turns a cart into amounts.
 * Used for the live summary in the form ("quote") and for the real order, so
 * the customer always pays what they saw. Pure, unit-tested.
 *
 * Discounts are written on the Shopify order the way Releasit does it: one
 * order-level fixed discount whose name lists the reasons
 * ("QUANTITY DISCOUNT", "CUSTOM DISCOUNT", or the promo code).
 */

import { formOnProduct, type ClickUpsell, type CodConfig, type OfferTier, type QuantityOffer, type ShippingRate, type TickUpsell } from "./config";

/** Pseudo-handle for an order from the cart page (several products). */
export const CART_HANDLE = "__cart__";

export const QUANTITY_LABEL = "QUANTITY DISCOUNT";
export const CUSTOM_LABEL = "CUSTOM DISCOUNT";

export interface PricedVariant {
  variantId: string;
  priceCents: number;
  title: string; // "Product - Variant"
  handle: string;
  available: boolean;
}

export interface CartLine {
  variantId: string;
  quantity: number;
}

export interface PromoCode {
  code: string;
  kind: "percent" | "fixed" | "free_shipping";
  value: number; // percent 0–100, or cents
  minSubtotalCents: number | null;
  /** "main": only the product of the page (Shopify code limited to collections). */
  scope?: "all" | "main";
}

export interface CartRequest {
  lines: CartLine[]; // main product (one or several variants)
  tickIds: string[];
  click: { id: string; kind: "upsell" | "downsell" } | null;
  promo: PromoCode | null;
  city: string;
}

export interface PricedLine {
  variantId: string;
  quantity: number;
  unitCents: number;
  title: string;
  kind: "main" | "tick" | "click";
}

export interface Quote {
  lines: PricedLine[];
  subtotalCents: number; // before discounts
  discounts: { label: string; cents: number }[];
  discountCents: number;
  shipping: { title: string; cents: number };
  totalCents: number;
  tier: OfferTier | null;
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; field: string; message: string };

/** Discount of a quantity tier on `units` (unit prices, one per piece). */
export function tierDiscount(tier: OfferTier, units: number[]): number {
  const sum = units.reduce((a, b) => a + b, 0);
  switch (tier.type) {
    case "percent":
      return Math.round((sum * Math.min(100, tier.value)) / 100);
    case "fixed":
      return Math.min(sum, tier.value);
    case "price": {
      // Bundle price covers `tier.qty` pieces; extra pieces stay at full price.
      const covered = [...units].sort((a, b) => b - a).slice(0, tier.qty).reduce((a, b) => a + b, 0);
      return Math.max(0, covered - tier.value);
    }
    case "free":
      return [...units]
        .sort((a, b) => a - b)
        .slice(0, Math.min(tier.value, units.length - 1))
        .reduce((a, b) => a + b, 0);
    default:
      return 0;
  }
}

/** First rate whose conditions match; free when no rate is set or none matches. */
export function pickShipping(
  rates: ShippingRate[],
  totalCents: number,
  qty: number,
  city: string,
  freeLabel: string
): { title: string; cents: number } {
  const c = city.trim().toLowerCase();
  for (const r of rates) {
    if (r.minTotalCents !== null && totalCents < r.minTotalCents) continue;
    if (r.maxTotalCents !== null && totalCents > r.maxTotalCents) continue;
    if (r.minQty !== null && qty < r.minQty) continue;
    if (r.cities.length && !r.cities.some((x) => x.toLowerCase() === c)) continue;
    return { title: r.name, cents: r.priceCents };
  }
  return { title: freeLabel, cents: 0 };
}

const add = (list: { label: string; cents: number }[], label: string, cents: number) => {
  if (cents <= 0) return;
  const hit = list.find((d) => d.label === label);
  if (hit) hit.cents += cents;
  else list.push({ label, cents });
};

/**
 * Price a cart. `variants` holds Shopify's live prices for every variant
 * involved (main lines + upsells). `handle` is the product the form is on.
 */
export function quoteCart(
  config: CodConfig,
  handle: string,
  variants: Map<string, PricedVariant>,
  req: CartRequest,
  offer: QuantityOffer | null,
  ticks: TickUpsell[],
  click: ClickUpsell | null
): QuoteResult {
  const lines: PricedLine[] = [];
  const units: number[] = [];
  let mainQty = 0;
  for (const l of req.lines) {
    const v = variants.get(l.variantId);
    const okProduct = handle === CART_HANDLE ? Boolean(v && formOnProduct(config, v.handle)) : Boolean(v && v.handle === handle.toLowerCase());
    if (!v || !okProduct) return { ok: false, field: "items", message: "Ce produit n'est pas disponible." };
    if (!v.available) return { ok: false, field: "items", message: `${v.title} est en rupture de stock.` };
    lines.push({ variantId: v.variantId, quantity: l.quantity, unitCents: v.priceCents, title: v.title, kind: "main" });
    for (let i = 0; i < l.quantity; i++) units.push(v.priceCents);
    mainQty += l.quantity;
  }
  if (!mainQty) return { ok: false, field: "items", message: "Panier invalide." };
  if (mainQty > config.fraud.maxQty) {
    return { ok: false, field: "items", message: `Quantité maximale : ${config.fraud.maxQty}.` };
  }

  const discounts: { label: string; cents: number }[] = [];

  // Quantity offer: the tier with exactly this quantity (else the largest below it).
  let tier: OfferTier | null = null;
  if (offer) {
    tier = [...offer.tiers].reverse().find((t) => t.qty <= mainQty) ?? null;
    if (tier) add(discounts, QUANTITY_LABEL, tierDiscount(tier, units));
  }

  // 1-tick extras: one piece each at their special price.
  for (const id of req.tickIds) {
    const u = ticks.find((t) => t.id === id);
    const v = u && variants.get(u.variantId);
    if (!u || !v || !v.available) continue;
    lines.push({ variantId: v.variantId, quantity: 1, unitCents: v.priceCents, title: v.title, kind: "tick" });
    add(discounts, CUSTOM_LABEL, Math.max(0, v.priceCents - u.priceCents));
  }

  // 1-click upsell (or its downsell after a refusal).
  if (req.click && click && req.click.id === click.id) {
    const v = variants.get(click.variantId);
    const special =
      req.click.kind === "downsell" ? (click.downsell.enabled ? click.downsell.priceCents : null) : click.priceCents;
    if (v && v.available && special !== null) {
      lines.push({ variantId: v.variantId, quantity: 1, unitCents: v.priceCents, title: v.title, kind: "click" });
      add(discounts, CUSTOM_LABEL, Math.max(0, v.priceCents - special));
    }
  }

  const subtotalCents = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
  let discountCents = discounts.reduce((s, d) => s + d.cents, 0);
  const afterOffers = subtotalCents - discountCents;

  let shipping = pickShipping(config.shippingRates, afterOffers, mainQty, req.city, config.texts.freeShipping);

  if (req.promo) {
    const p = req.promo;
    if (p.minSubtotalCents !== null && afterOffers < p.minSubtotalCents) {
      return { ok: false, field: "discount", message: "Montant minimum non atteint pour ce code." };
    }
    const mainNet = Math.max(
      0,
      lines.filter((l) => l.kind === "main").reduce((s, l) => s + l.unitCents * l.quantity, 0) -
        (discounts.find((d) => d.label === QUANTITY_LABEL)?.cents ?? 0)
    );
    const base = p.scope === "main" ? mainNet : afterOffers;
    if (p.kind === "percent") add(discounts, p.code, Math.round((base * Math.min(100, p.value)) / 100));
    else if (p.kind === "fixed") add(discounts, p.code, Math.min(base, p.value));
    else shipping = { title: shipping.title, cents: 0 };
    discountCents = discounts.reduce((s, d) => s + d.cents, 0);
  }

  discountCents = Math.min(discountCents, subtotalCents);
  return {
    ok: true,
    quote: {
      lines,
      subtotalCents,
      discounts,
      discountCents,
      shipping,
      totalCents: subtotalCents - discountCents + shipping.cents,
      tier,
    },
  };
}

/** Label for the single Shopify discount ("PROMO1, CUSTOM DISCOUNT"), Releasit style. */
export const discountTitle = (q: Quote) => q.discounts.map((d) => d.label).join(", ").slice(0, 255);
