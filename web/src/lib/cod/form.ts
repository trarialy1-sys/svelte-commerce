/**
 * Own cash-on-delivery order form (replaces the paid COD-form app).
 * Pure helpers only — unit-tested, no I/O. The storefront script
 * (`public/cod-form.js`) posts here; the server never trusts prices or
 * totals sent by the browser.
 */

export const COD_TAG = "odes_cod_form";
export const COD_GATEWAY = "Cash on Delivery (COD)";
export const COD_ACTION = {
  LEAD: "cod.lead",
  ORDER: "cod.order_created",
  FAILED: "cod.order_failed",
} as const;

export const MAX_LINES = 5;
export const MAX_QTY = 10;

export interface CodItem {
  variantId: string; // numeric Shopify variant id
  quantity: number;
}

export interface CodSubmission {
  leadId: string;
  name: string;
  phone: string; // E.164, +212XXXXXXXXX
  city: string;
  address: string;
  newsletter: boolean;
  items: CodItem[];
  utm: Record<string, string>;
  pageUrl: string | null;
}

export type Validation =
  | { ok: true; value: CodSubmission }
  | { ok: false; field: string; message: string };

/**
 * Moroccan mobile/landline → E.164. Accepts 06…, 6…, +2126…, 002126…,
 * 2126…, with spaces/dots/dashes, and Arabic-Indic digits. Null if invalid.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("212")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^[5-8]\d{8}$/.test(d) ? `+212${d}` : null;
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Comma-separated product handles, or "*" for every product. Empty = off. */
export function parseEnabledProducts(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isProductEnabled(enabled: string[], handle: string): boolean {
  return enabled.includes("*") || enabled.includes(handle.toLowerCase());
}

export function validateSubmission(body: unknown): Validation {
  const b = (body ?? {}) as Record<string, unknown>;
  const leadId = clean(b.leadId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(leadId)) {
    return { ok: false, field: "leadId", message: "Requête invalide." };
  }
  const name = clean(b.name, 80);
  if (name.length < 2) return { ok: false, field: "name", message: "Indiquez votre nom." };
  const phone = normalizePhone(b.phone);
  if (!phone) {
    return { ok: false, field: "phone", message: "Insérez un numéro de téléphone valide." };
  }
  const city = clean(b.city, 80);
  if (city.length < 2) return { ok: false, field: "city", message: "Indiquez votre ville." };
  const address = clean(b.address, 200);
  if (address.length < 3) {
    return { ok: false, field: "address", message: "Indiquez votre adresse." };
  }
  const rawItems = Array.isArray(b.items) ? b.items : [];
  const merged = new Map<string, number>();
  for (const it of rawItems.slice(0, 20)) {
    const r = (it ?? {}) as Record<string, unknown>;
    const id = String(r.variantId ?? "");
    const q = Number(r.quantity);
    if (!/^\d{6,20}$/.test(id) || !Number.isInteger(q) || q < 1) {
      return { ok: false, field: "items", message: "Panier invalide." };
    }
    merged.set(id, (merged.get(id) ?? 0) + q);
  }
  if (merged.size === 0 || merged.size > MAX_LINES) {
    return { ok: false, field: "items", message: "Panier invalide." };
  }
  const items: CodItem[] = [];
  for (const [variantId, quantity] of merged) {
    if (quantity > MAX_QTY) {
      return { ok: false, field: "items", message: `Quantité maximale : ${MAX_QTY}.` };
    }
    items.push({ variantId, quantity });
  }
  const utm: Record<string, string> = {};
  const u = (b.utm ?? {}) as Record<string, unknown>;
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
    const v = clean(u[k], 150);
    if (v) utm[k] = v;
  }
  const pageUrl = clean(b.pageUrl, 300);
  return {
    ok: true,
    value: {
      leadId,
      name,
      phone,
      city,
      address,
      newsletter: b.newsletter === true,
      items,
      utm,
      pageUrl: /^https:\/\//.test(pageUrl) ? pageUrl : null,
    },
  };
}

/** Money as Shopify wants it ("149.00"), from integer cents. */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function amountToCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

/** Allowed browser origins for the public endpoint. */
export function allowedOrigins(env: string | undefined, shopDomain?: string): string[] {
  const list = (env ?? "https://odes.ma,https://www.odes.ma")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (shopDomain) list.push(`https://${shopDomain}`);
  return list;
}
