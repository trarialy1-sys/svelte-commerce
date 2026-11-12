import crypto from "node:crypto";

/**
 * Meta Conversions API — server-side Purchase for COD-form orders.
 *
 * The browser pixel already fires Purchase with eventID "odc_<order name>";
 * the server event uses the same id so Meta keeps one and drops the other.
 * Server events still arrive when an ad blocker or iOS stops the pixel.
 *
 * Pure helpers here (hashing, payload) are unit-tested; `sendCapiEvent` does
 * the HTTP call.
 */

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v24.0";

/** Same id as the browser pixel's Purchase (see public/cod-form.js). */
export const purchaseEventId = (orderName: string) => `odc_${orderName}`;

/** Meta wants SHA-256 hex of the normalized value. */
export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Phone for Meta: digits only, with country code, no "+" or leading 0. */
export function normalizePhoneForMeta(phone: string): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  const m = /^(?:00)?212(0?)(\d{9})$/.exec(d) ?? /^0(\d{9})$/.exec(d);
  if (m) return `212${m[m.length - 1]}`;
  return d.replace(/^00/, "");
}

/** City for Meta: lowercase, no spaces, no punctuation, no accents. */
export function normalizeCityForMeta(city: string): string | null {
  const c = (city ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return c || null;
}

/** _fbp / _fbc cookie values look like "fb.1.<ms>.<id>". */
export function cleanFbCookie(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 300);
  return /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_.-]+$/.test(s) ? s : null;
}

export interface PurchaseInput {
  orderName: string;
  orderId: string;
  value: number;
  currency: string;
  contentIds: string[];
  numItems: number;
  /** Already hashed (never send raw phone/city through the job queue). */
  phoneHash: string | null;
  cityHash: string | null;
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  sourceUrl: string | null;
  eventTime: number; // unix seconds
}

/** Everything the job needs, with personal data hashed before it leaves the request. */
export function buildPurchaseInput(a: {
  orderName: string;
  orderId: string;
  totalCents: number;
  currency: string;
  variantIds: string[];
  numItems: number;
  phone: string;
  city: string;
  ip: string | null;
  userAgent: string | null;
  fbp: unknown;
  fbc: unknown;
  sourceUrl: string | null;
  now?: Date;
}): PurchaseInput {
  const ph = normalizePhoneForMeta(a.phone);
  const ct = normalizeCityForMeta(a.city);
  return {
    orderName: a.orderName,
    orderId: a.orderId,
    value: a.totalCents / 100,
    currency: a.currency,
    contentIds: a.variantIds,
    numItems: a.numItems,
    phoneHash: ph ? sha256(ph) : null,
    cityHash: ct ? sha256(ct) : null,
    ip: a.ip,
    userAgent: a.userAgent ? a.userAgent.slice(0, 500) : null,
    fbp: cleanFbCookie(a.fbp),
    fbc: cleanFbCookie(a.fbc),
    sourceUrl: a.sourceUrl,
    eventTime: Math.floor((a.now ?? new Date()).getTime() / 1000),
  };
}

/** The `data[]` entry Meta expects. */
export function purchaseEvent(p: PurchaseInput, country = "ma") {
  const user_data: Record<string, unknown> = { country: [sha256(country)] };
  if (p.phoneHash) {
    user_data.ph = [p.phoneHash];
    user_data.external_id = [p.phoneHash];
  }
  if (p.cityHash) user_data.ct = [p.cityHash];
  if (p.ip) user_data.client_ip_address = p.ip;
  if (p.userAgent) user_data.client_user_agent = p.userAgent;
  if (p.fbp) user_data.fbp = p.fbp;
  if (p.fbc) user_data.fbc = p.fbc;
  return {
    event_name: "Purchase",
    event_time: p.eventTime,
    event_id: purchaseEventId(p.orderName),
    action_source: "website",
    ...(p.sourceUrl ? { event_source_url: p.sourceUrl } : {}),
    user_data,
    custom_data: {
      value: p.value,
      currency: p.currency,
      content_type: "product",
      content_ids: p.contentIds,
      num_items: p.numItems,
      order_id: p.orderName,
    },
  };
}

export function capiConfigured(): boolean {
  return Boolean(process.env.COD_FORM_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

/** POST one event. Returns Meta's events_received count; throws on error (job retries). */
export async function sendCapiEvent(event: ReturnType<typeof purchaseEvent>): Promise<{ received: number; traceId: string | null }> {
  const pixel = process.env.COD_FORM_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token) throw new Error("COD_FORM_PIXEL_ID / META_CAPI_TOKEN manquants.");
  const body: Record<string, unknown> = { data: [event], access_token: token };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixel)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    events_received?: number;
    fbtrace_id?: string;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || json.error) {
    throw new Error(`Meta CAPI ${res.status}: ${json.error?.message ?? "erreur inconnue"}`.slice(0, 300));
  }
  return { received: json.events_received ?? 0, traceId: json.fbtrace_id ?? null };
}
