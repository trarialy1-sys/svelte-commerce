/**
 * Per-store settings of the COD order form (what Releasit's admin edits).
 * Pure: types, defaults and `sanitizeConfig` (untrusted JSON → safe config).
 * Stored in Integration(provider COD_FORM).meta; read by the public endpoint
 * and the storefront script.
 */

export type FieldKey = "name" | "phone" | "city" | "address" | "address2" | "email" | "note";

export interface FieldConfig {
  key: FieldKey;
  show: boolean;
  required: boolean;
  label: string;
  placeholder: string;
}

export type TierType = "none" | "percent" | "fixed" | "price" | "free";

export interface OfferTier {
  qty: number;
  type: TierType;
  /** percent: 0–100; fixed / price: cents; free: number of free pieces */
  value: number;
  label: string;
  badge: string;
  preselected: boolean;
}

export interface QuantityOffer {
  id: string;
  name: string;
  products: string[]; // handles, "*" = all
  tiers: OfferTier[];
}

export interface ShippingRate {
  id: string;
  name: string;
  priceCents: number;
  minTotalCents: number | null;
  maxTotalCents: number | null;
  minQty: number | null;
  cities: string[]; // empty = everywhere
}

export interface TickUpsell {
  id: string;
  variantId: string;
  label: string;
  priceCents: number; // special price
  products: string[]; // shown on these handles, "*" = all
}

export interface ClickUpsell {
  id: string;
  variantId: string;
  headline: string;
  text: string;
  priceCents: number;
  products: string[];
  downsell: { enabled: boolean; headline: string; priceCents: number };
}

export interface PromoCodeConfig {
  code: string;
  kind: "percent" | "fixed" | "free_shipping";
  value: number; // percent 0–100, or cents
  minSubtotalCents: number | null;
}

export interface Pixels {
  meta: string[];
  tiktok: string[];
  google: { id: string; label: string }[]; // AW-xxx + purchase conversion label
  snapchat: string[];
  pinterest: string[];
}

export interface Texts {
  button: string;
  title: string;
  submit: string;
  addressTitle: string;
  quantity: string;
  shipping: string;
  freeShipping: string;
  subtotal: string;
  total: string;
  discount: string;
  discountPlaceholder: string;
  discountApply: string;
  newsletter: string;
  note: string;
  thankYou: string;
  upsellAccept: string;
  upsellDecline: string;
  offerTitle: string;
  piece: string;
}

export interface CodConfig {
  enabled: boolean;
  products: string[]; // handles, "*" = all
  excludeProducts: string[];
  mode: "popup" | "embedded";
  stickyButton: boolean;
  /** Button on the cart page: orders every product of the cart that the form is on. */
  cartButton: boolean;
  hideAddToCart: boolean;
  hideBuyNow: boolean;
  hideSelectors: string; // CSS of other COD apps' buttons to hide where ours shows
  dir: "ltr" | "rtl";
  currencyLabel: string;
  colors: { primary: string; primaryText: string; radius: number };
  texts: Texts;
  fields: FieldConfig[];
  cityList: string[];
  newsletter: boolean;
  discountCodes: boolean;
  /** Codes defined here; Shopify's own discount codes are also accepted when the app can read them. */
  promoCodes: PromoCodeConfig[];
  thankYouUrl: string;
  pixels: Pixels;
  shippingRates: ShippingRate[];
  offers: QuantityOffer[];
  tickUpsells: TickUpsell[];
  clickUpsells: ClickUpsell[];
  fraud: {
    maxPerPhone: number;
    phoneWindowMin: number;
    maxPerIp: number;
    ipWindowMin: number;
    maxQty: number;
    blockedPhones: string[];
    blockedIps: string[];
  };
}

export const DEFAULT_TEXTS: Texts = {
  button: "Commander — paiement à la livraison",
  title: "Commande avec paiement à la livraison",
  submit: "Terminez votre achat",
  addressTitle: "Votre adresse de livraison",
  quantity: "Quantité",
  shipping: "Livraison",
  freeShipping: "Gratuite",
  subtotal: "Sous-total",
  total: "Total",
  discount: "Réduction",
  discountPlaceholder: "Code promo",
  discountApply: "Appliquer",
  newsletter: "Recevoir les nouveautés et offres",
  note: "Vous payez à la réception. Livraison en 24 à 72 h partout au Maroc.",
  thankYou: "Merci ! Votre commande est enregistrée. Nous vous appelons pour la confirmer.",
  upsellAccept: "Oui, ajouter à ma commande",
  upsellDecline: "Non merci",
  offerTitle: "Choisissez votre offre",
  piece: "Pièce",
};

export const DEFAULT_FIELDS: FieldConfig[] = [
  { key: "name", show: true, required: true, label: "Nom", placeholder: "" },
  { key: "phone", show: true, required: true, label: "Téléphone", placeholder: "06 XX XX XX XX" },
  { key: "address", show: true, required: true, label: "Adresse", placeholder: "" },
  { key: "city", show: true, required: true, label: "Ville", placeholder: "" },
  { key: "address2", show: false, required: false, label: "Complément d'adresse", placeholder: "" },
  { key: "email", show: false, required: false, label: "E-mail", placeholder: "" },
  { key: "note", show: false, required: false, label: "Remarque", placeholder: "" },
];

/** Releasit's product-page and floating buttons (checked on odes.ma, 12 Nov 2026), hidden where our form is on (one COD button only). */
export const DEFAULT_HIDE_SELECTORS = "#_rsi-buy-now-button, ._rsi-buy-now-button, #_rsi-buy-now-button-floating, ._rsi-buy-now-button-floating";

export function defaultConfig(env: Record<string, string | undefined> = {}): CodConfig {
  const products = (env.COD_FORM_PRODUCTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    enabled: products.length > 0,
    products,
    excludeProducts: [],
    mode: "popup",
    stickyButton: false,
    cartButton: false,
    hideAddToCart: false,
    hideBuyNow: false,
    hideSelectors: DEFAULT_HIDE_SELECTORS,
    dir: "ltr",
    currencyLabel: "dh",
    colors: { primary: "#111111", primaryText: "#ffffff", radius: 10 },
    texts: { ...DEFAULT_TEXTS },
    fields: DEFAULT_FIELDS.map((f) => ({ ...f })),
    cityList: [],
    newsletter: true,
    discountCodes: false,
    promoCodes: [],
    thankYouUrl: env.COD_FORM_THANKYOU_URL ?? "",
    pixels: {
      meta: env.COD_FORM_PIXEL_ID ? [env.COD_FORM_PIXEL_ID] : [],
      tiktok: [],
      google: [],
      snapchat: [],
      pinterest: [],
    },
    shippingRates: [],
    offers: [],
    tickUpsells: [],
    clickUpsells: [],
    fraud: {
      maxPerPhone: 3,
      phoneWindowMin: 10,
      maxPerIp: 10,
      ipWindowMin: 60,
      maxQty: 10,
      blockedPhones: [],
      blockedIps: [],
    },
  };
}

// ── sanitizing (the admin form and the DB are both untrusted input) ──────────

const str = (v: unknown, max: number, def = ""): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : def;
const bool = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);
const int = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
const intOrNull = (v: unknown, min: number, max: number): number | null =>
  v === null || v === undefined || v === "" ? null : int(v, min, max, min);
const arr = <T>(v: unknown, max: number, map: (x: unknown, i: number) => T | null): T[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, max)
    .map(map)
    .filter((x): x is T => x !== null);
const strList = (v: unknown, max: number, len: number): string[] => {
  const raw = typeof v === "string" ? v.split(/[\n,]/) : Array.isArray(v) ? v : [];
  return [...new Set(raw.map((x) => str(x, len)).filter(Boolean))].slice(0, max);
};
const handles = (v: unknown): string[] => strList(v, 500, 255).map((h) => h.toLowerCase());
const id = (v: unknown, i: number, prefix: string): string => {
  const s = str(v, 40);
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : `${prefix}${i + 1}`;
};
const color = (v: unknown, def: string): string => {
  const s = str(v, 9);
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : def;
};
const variantId = (v: unknown): string | null => {
  const s = str(v, 60).replace(/^gid:\/\/shopify\/ProductVariant\//, "");
  return /^\d{6,20}$/.test(s) ? s : null;
};
const TIER_TYPES: TierType[] = ["none", "percent", "fixed", "price", "free"];
const FIELD_KEYS: FieldKey[] = ["name", "phone", "city", "address", "address2", "email", "note"];

export function sanitizeConfig(input: unknown, env: Record<string, string | undefined> = {}): CodConfig {
  const d = defaultConfig(env);
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const t = (c.texts ?? {}) as Record<string, unknown>;
  const col = (c.colors ?? {}) as Record<string, unknown>;
  const px = (c.pixels ?? {}) as Record<string, unknown>;
  const fr = (c.fraud ?? {}) as Record<string, unknown>;

  const texts = { ...d.texts };
  for (const k of Object.keys(texts) as (keyof Texts)[]) texts[k] = str(t[k], 300) || d.texts[k];

  // Fields: keep the stored order, add any missing key at the end; name+phone always on.
  const seen = new Set<FieldKey>();
  const fields: FieldConfig[] = [];
  for (const f of Array.isArray(c.fields) ? c.fields : []) {
    const r = (f ?? {}) as Record<string, unknown>;
    const key = r.key as FieldKey;
    if (!FIELD_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    const def = d.fields.find((x) => x.key === key)!;
    const locked = key === "name" || key === "phone";
    fields.push({
      key,
      show: locked ? true : bool(r.show, def.show),
      required: locked ? true : bool(r.required, def.required),
      label: str(r.label, 80) || def.label,
      placeholder: str(r.placeholder, 80),
    });
  }
  for (const def of d.fields) if (!seen.has(def.key)) fields.push({ ...def });

  return {
    enabled: bool(c.enabled, d.enabled),
    products: c.products === undefined ? d.products : handles(c.products),
    excludeProducts: handles(c.excludeProducts),
    mode: c.mode === "embedded" ? "embedded" : "popup",
    stickyButton: bool(c.stickyButton, d.stickyButton),
    cartButton: bool(c.cartButton, false),
    hideAddToCart: bool(c.hideAddToCart, false),
    hideBuyNow: bool(c.hideBuyNow, false),
    hideSelectors: c.hideSelectors === undefined ? d.hideSelectors : str(c.hideSelectors, 500).replace(/[{}<>]/g, ""),
    dir: c.dir === "rtl" ? "rtl" : "ltr",
    currencyLabel: str(c.currencyLabel, 10) || d.currencyLabel,
    colors: {
      primary: color(col.primary, d.colors.primary),
      primaryText: color(col.primaryText, d.colors.primaryText),
      radius: int(col.radius, 0, 30, d.colors.radius),
    },
    texts,
    fields,
    cityList: strList(c.cityList, 2000, 80),
    newsletter: bool(c.newsletter, d.newsletter),
    discountCodes: bool(c.discountCodes, false),
    promoCodes: arr(c.promoCodes, 100, (x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const code = str(r.code, 40).toUpperCase();
      if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return null;
      const kind = r.kind === "fixed" || r.kind === "free_shipping" ? r.kind : "percent";
      return {
        code,
        kind,
        value: kind === "percent" ? int(r.value, 0, 100, 0) : kind === "fixed" ? int(r.value, 0, 1_000_000_000, 0) : 0,
        minSubtotalCents: intOrNull(r.minSubtotalCents, 0, 1_000_000_000),
      };
    }),
    thankYouUrl: /^https:\/\//.test(str(c.thankYouUrl, 300)) ? str(c.thankYouUrl, 300) : c.thankYouUrl === undefined ? d.thankYouUrl : "",
    pixels: {
      meta: c.pixels === undefined ? d.pixels.meta : strList(px.meta, 5, 30).filter((x) => /^\d{6,20}$/.test(x)),
      tiktok: strList(px.tiktok, 5, 40).filter((x) => /^[A-Z0-9]{10,30}$/i.test(x)),
      google: arr(px.google, 5, (g) => {
        const r = (g ?? {}) as Record<string, unknown>;
        const gid = str(r.id, 30);
        return /^AW-\d{5,15}$/.test(gid) ? { id: gid, label: str(r.label, 60).replace(/[^A-Za-z0-9_-]/g, "") } : null;
      }),
      snapchat: strList(px.snapchat, 5, 60).filter((x) => /^[a-f0-9-]{20,60}$/i.test(x)),
      pinterest: strList(px.pinterest, 5, 30).filter((x) => /^\d{6,20}$/.test(x)),
    },
    shippingRates: arr(c.shippingRates, 30, (x, i) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const name = str(r.name, 80);
      if (!name) return null;
      return {
        id: id(r.id, i, "rate"),
        name,
        priceCents: int(r.priceCents, 0, 10_000_000, 0),
        minTotalCents: intOrNull(r.minTotalCents, 0, 1_000_000_000),
        maxTotalCents: intOrNull(r.maxTotalCents, 0, 1_000_000_000),
        minQty: intOrNull(r.minQty, 1, 1000),
        cities: strList(r.cities, 500, 80),
      };
    }),
    offers: arr(c.offers, 50, (x, i) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const tiers = arr(r.tiers, 6, (y) => {
        const tr = (y ?? {}) as Record<string, unknown>;
        const type = TIER_TYPES.includes(tr.type as TierType) ? (tr.type as TierType) : "none";
        const qty = int(tr.qty, 1, 10, 1);
        return {
          qty,
          type,
          value:
            type === "percent" ? int(tr.value, 0, 100, 0) : type === "free" ? int(tr.value, 0, qty - 1, 0) : int(tr.value, 0, 1_000_000_000, 0),
          label: str(tr.label, 80) || `${qty}`,
          badge: str(tr.badge, 40),
          preselected: bool(tr.preselected, false),
        };
      }).sort((a, b) => a.qty - b.qty);
      const uniq = tiers.filter((tr, j) => j === 0 || tr.qty !== tiers[j - 1].qty);
      const prods = handles(r.products);
      if (!uniq.length || !prods.length) return null;
      return { id: id(r.id, i, "offer"), name: str(r.name, 80) || `Offre ${i + 1}`, products: prods, tiers: uniq };
    }),
    tickUpsells: arr(c.tickUpsells, 10, (x, i) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const vid = variantId(r.variantId);
      if (!vid) return null;
      return {
        id: id(r.id, i, "tick"),
        variantId: vid,
        label: str(r.label, 120) || "Ajouter",
        priceCents: int(r.priceCents, 0, 1_000_000_000, 0),
        products: handles(r.products).length ? handles(r.products) : ["*"],
      };
    }),
    clickUpsells: arr(c.clickUpsells, 10, (x, i) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const vid = variantId(r.variantId);
      if (!vid) return null;
      const ds = (r.downsell ?? {}) as Record<string, unknown>;
      return {
        id: id(r.id, i, "click"),
        variantId: vid,
        headline: str(r.headline, 120) || "Offre spéciale",
        text: str(r.text, 300),
        priceCents: int(r.priceCents, 0, 1_000_000_000, 0),
        products: handles(r.products).length ? handles(r.products) : ["*"],
        downsell: {
          enabled: bool(ds.enabled, false),
          headline: str(ds.headline, 120) || "Dernière chance",
          priceCents: int(ds.priceCents, 0, 1_000_000_000, 0),
        },
      };
    }),
    fraud: {
      maxPerPhone: int(fr.maxPerPhone, 1, 100, d.fraud.maxPerPhone),
      phoneWindowMin: int(fr.phoneWindowMin, 1, 10_080, d.fraud.phoneWindowMin),
      maxPerIp: int(fr.maxPerIp, 1, 1000, d.fraud.maxPerIp),
      ipWindowMin: int(fr.ipWindowMin, 1, 10_080, d.fraud.ipWindowMin),
      maxQty: int(fr.maxQty, 1, 100, d.fraud.maxQty),
      blockedPhones: strList(fr.blockedPhones, 2000, 30),
      blockedIps: strList(fr.blockedIps, 2000, 64),
    },
  };
}

const matches = (list: string[], handle: string) => list.includes("*") || list.includes(handle.toLowerCase());

/** Is the form on for this product? */
export function formOnProduct(c: CodConfig, handle: string): boolean {
  return c.enabled && matches(c.products, handle) && !c.excludeProducts.includes(handle.toLowerCase());
}

export const offerForProduct = (c: CodConfig, handle: string): QuantityOffer | null =>
  c.offers.find((o) => matches(o.products, handle)) ?? null;

export const tickUpsellsFor = (c: CodConfig, handle: string): TickUpsell[] =>
  c.tickUpsells.filter((u) => matches(u.products, handle));

export const clickUpsellFor = (c: CodConfig, handle: string): ClickUpsell | null =>
  c.clickUpsells.find((u) => matches(u.products, handle)) ?? null;

/** What the storefront script receives for one product (no fraud lists). */
export function publicConfig(c: CodConfig, handle: string) {
  const cart = handle === "__cart__";
  return {
    enabled: cart ? c.enabled && c.cartButton : formOnProduct(c, handle),
    products: cart ? c.products : undefined,
    excludeProducts: cart ? c.excludeProducts : undefined,
    mode: c.mode,
    stickyButton: c.stickyButton,
    hideAddToCart: c.hideAddToCart,
    hideBuyNow: c.hideBuyNow,
    hideSelectors: c.hideSelectors,
    dir: c.dir,
    currencyLabel: c.currencyLabel,
    colors: c.colors,
    texts: c.texts,
    fields: c.fields.filter((f) => f.show),
    cityList: c.cityList,
    newsletter: c.newsletter,
    discountCodes: c.discountCodes,
    thankYouUrl: c.thankYouUrl || null,
    pixelId: c.pixels.meta[0] ?? null,
    pixels: c.pixels,
    maxQty: c.fraud.maxQty,
    offer: cart ? null : offerForProduct(c, handle),
    tickUpsells: cart ? [] : tickUpsellsFor(c, handle),
    clickUpsell: cart ? null : clickUpsellFor(c, handle),
    shippingRates: c.shippingRates,
  };
}
