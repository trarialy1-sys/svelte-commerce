import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { db, getOrgDb } from "@/lib/db";
import { getCredentials } from "@/lib/integrations/vault";
import { logError } from "@/lib/observability/logger";
import {
  deepFindKey,
  errMsg,
  formatPhone,
  isUsedBefore,
} from "./ozon-helpers";
import { missingShippingFields } from "./validate";

export interface OzonClient {
  base: string;
  post(path: string, fd: FormData): Promise<unknown>;
}

/** Per-org OzonExpress client. Base URL carries the customer id + key (server-only). */
export async function getOzonClient(orgId: string): Promise<OzonClient> {
  const creds = await getCredentials(orgId, "OZON");
  if (!creds) {
    throw new Error("OzonExpress n'est pas connecté pour cette organisation.");
  }
  const base = `https://api.ozonexpress.ma/customers/${creds.customerId}/${creds.apiKey}`;

  async function post(path: string, fd: FormData): Promise<unknown> {
    // NB: never log `base` — it embeds the customer id + api key.
    let r: Response;
    try {
      r = await fetch(`${base}/${path}`, {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      logError(`OzonExpress ${path}: échec réseau`, err, {
        provider: "ozon",
        orgId,
        route: path,
      });
      throw err;
    }
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error(
        `OzonExpress ${path}: réponse non-JSON (HTTP ${r.status}).`
      );
      logError(err.message, err, { provider: "ozon", orgId, route: path });
      throw err;
    }
  }

  return { base, post };
}

export interface ParcelResult {
  orderId: string;
  code: string;
  ok: boolean;
  tracking?: string;
  cityName?: string;
  price?: string;
  error?: string;
  /** Ozon says the tracking already exists → route to the BL-only path. */
  usedBefore?: boolean;
}

interface SendOpts {
  /** 0 = ramassage (pickup), 1 = stock. */
  stock?: number;
  /** Operator-supplied tracking override (retry only) — never auto-suffixed. */
  tracking?: string;
  actorUserId?: string | null;
}

/** Strip a city name to A–Z (drop accents/spaces/punctuation), uppercased. */
function cityCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

interface CodeSuiviOrder {
  code: string;
  phone: string | null;
  cityId: number | null;
  cityRaw: string | null;
  items: { sku: string }[];
}

/**
 * Generate the code d'envoi: `{firstSKU}_{CITY3}{phoneLast4}` — city = the
 * resolved OzonExpress city name (first 3 letters). Deduped against OTHER
 * orders' parcels by appending `-2`, `-3`, …
 */
async function buildCodeSuivi(
  odb: ReturnType<typeof getOrgDb>,
  orderId: string,
  order: CodeSuiviOrder
): Promise<string> {
  const sku = order.items[0]?.sku || order.code || "NA";
  let cityName = order.cityRaw ?? "";
  if (order.cityId != null) {
    const city = await db.cityCatalog.findUnique({
      where: { id: order.cityId },
      select: { name: true },
    });
    if (city?.name) cityName = city.name;
  }
  const city3 = cityCode(cityName).slice(0, 3) || "VIL";
  const last4 = formatPhone(order.phone).replace(/\D/g, "").slice(-4);
  const base = `${sku}_${city3}${last4}`;

  let candidate = base;
  let i = 2;
  while (
    await odb.parcel.findFirst({
      where: { tracking: candidate, orderId: { not: orderId } },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

/**
 * Create one real parcel at OzonExpress for a Prêtes order, then persist the
 * Parcel row. The tracking is the generated code d'envoi (or an operator
 * override on retry); deep-find TRACKING-NUMBER, errMsg on failure, "Used
 * Before" → usedBefore.
 */
export async function createParcelForOrder(
  orgId: string,
  orderId: string,
  opts: SendOpts = {}
): Promise<ParcelResult> {
  const odb = getOrgDb(orgId);
  const order = await odb.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { sku: true, qty: true } },
      customer: { select: { name: true } },
    },
  });
  if (!order) return { orderId, code: "", ok: false, error: "Commande introuvable." };

  const code = order.code;
  if (order.cityId == null) {
    return { orderId, code, ok: false, error: "Ville non résolue (cityId manquant)." };
  }

  // Pre-send check: fail fast with a precise message instead of letting Ozon
  // return its generic "Some fields Empty".
  const missing = missingShippingFields({
    customerName: order.customer?.name,
    phone: order.phone,
    address: order.address,
    price: Number(order.totalPrice),
  });
  if (missing.length > 0) {
    return {
      orderId,
      code,
      ok: false,
      error: `Champs manquants : ${missing.join(", ")}.`,
    };
  }

  try {
    // Code d'envoi: operator override on retry, else generated
    // {SKU}_{CITY3}{phoneLast4} (deduped).
    const tracking =
      opts.tracking?.trim() || (await buildCodeSuivi(odb, orderId, order));
    const fd = new FormData();
    if (tracking) fd.append("tracking-number", tracking);
    fd.append("parcel-receiver", order.customer?.name ?? "");
    fd.append("parcel-phone", formatPhone(order.phone));
    fd.append("parcel-city", String(order.cityId)); // numeric id, required
    fd.append("parcel-address", order.address ?? "");
    fd.append("parcel-price", String(Number(order.totalPrice)));
    fd.append("parcel-stock", String(opts.stock ?? 0)); // 0 = ramassage
    if (order.note) fd.append("parcel-note", order.note);
    const products = order.items.map((i) => ({ ref: i.sku, qnty: i.qty }));
    if (products.length) fd.append("products", JSON.stringify(products));

    const { post } = await getOzonClient(orgId);
    const j = await post("add-parcel", fd);

    const tn = deepFindKey(j, "TRACKING-NUMBER");
    if (tn) {
      const trackingNumber = String(tn);
      const cityName = deepFindKey(j, "CITY_NAME") ?? deepFindKey(j, "CITY-NAME");
      const price = deepFindKey(j, "PRICE");
      await odb.parcel.upsert({
        where: { orderId },
        create: {
          orgId,
          orderId,
          tracking: trackingNumber,
          ozonCityId: order.cityId,
          codPrice: Number(order.totalPrice),
          status: ParcelStatus.CREE,
        },
        update: {
          tracking: trackingNumber,
          ozonCityId: order.cityId,
          codPrice: Number(order.totalPrice),
          status: ParcelStatus.CREE,
        },
      });
      await odb.auditLog.create({
        data: {
          orgId,
          actorUserId: opts.actorUserId ?? null,
          action: "shipping.parcel_created",
          entity: "Parcel",
          entityId: orderId,
          meta: { tracking: trackingNumber },
        },
      });
      return {
        orderId,
        code,
        ok: true,
        tracking: trackingNumber,
        cityName: cityName != null ? String(cityName) : undefined,
        price: price != null ? String(price) : undefined,
      };
    }

    const error = errMsg(j);
    if (isUsedBefore(error)) {
      // Already exists at Ozon — its code IS the tracking; route to BL-only.
      return { orderId, code, ok: false, usedBefore: true, tracking, error };
    }
    return { orderId, code, ok: false, error };
  } catch (e) {
    return {
      orderId,
      code,
      ok: false,
      error: e instanceof Error ? e.message : "Échec de l'envoi.",
    };
  }
}
