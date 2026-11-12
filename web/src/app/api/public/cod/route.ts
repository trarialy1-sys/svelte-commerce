import { NextResponse, type NextRequest } from "next/server";

import { allowedOrigins, isProductEnabled, validateSubmission } from "@/lib/cod/form";
import { codEnabledProducts, createCodOrder, resolveOrgByShop, saveLead } from "@/lib/cod/order";
import { inngest, type AppEvents } from "@/lib/inngest/client";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public endpoint behind the storefront COD form (`/cod-form.js`).
 *   GET  ?shop=…&handle=…  → is the form on for this product + its settings
 *   POST { action: "lead" | "order", shop, … }
 * No session: guarded by the origin allow-list, strict validation, server-side
 * prices and per-phone / per-IP limits.
 */

function cors(req: NextRequest, shop?: string): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = allowedOrigins(process.env.COD_FORM_ORIGINS, shop).includes(origin);
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
  };
}

const clientIp = (req: NextRequest): string | null =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim().slice(0, 64) || null;

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop") ?? "";
  const handle = req.nextUrl.searchParams.get("handle") ?? "";
  const enabled = handle !== "" && isProductEnabled(codEnabledProducts(), handle);
  return NextResponse.json(
    {
      enabled,
      pixelId: process.env.COD_FORM_PIXEL_ID ?? null,
      thankYouUrl: process.env.COD_FORM_THANKYOU_URL ?? null,
    },
    { headers: cors(req, shop) }
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "Requête invalide." }, { status: 400, headers: cors(req) });
  }
  const shop = String(body.shop ?? "");
  const headers = cors(req, shop);
  // Browsers always send Origin on cross-site POSTs; anything else is not our form.
  if (!headers["Access-Control-Allow-Origin"]) {
    return NextResponse.json({ ok: false, message: "Origine refusée." }, { status: 403, headers });
  }
  // Honeypot: real visitors never fill the hidden field.
  if (typeof body.website === "string" && body.website !== "") {
    return NextResponse.json({ ok: true, orderName: "" }, { headers });
  }
  // An abandoned form rarely has every field: keep whatever was typed.
  if (body.action === "lead") {
    if (!body.city) body.city = "--";
    if (!body.address) body.address = "---";
    if (!body.name) body.name = "--";
  }
  const v = validateSubmission(body);
  if (!v.ok) {
    return NextResponse.json({ ok: false, field: v.field, message: v.message }, { status: 400, headers });
  }
  try {
    const orgId = await resolveOrgByShop(shop);
    if (!orgId) {
      return NextResponse.json({ ok: false, message: "Boutique inconnue." }, { status: 404, headers });
    }
    const ip = clientIp(req);
    if (body.action === "lead") {
      await saveLead(orgId, v.value, ip);
      return NextResponse.json({ ok: true }, { headers });
    }
    const r = await createCodOrder(orgId, v.value, ip);
    if (!r.ok) {
      return NextResponse.json({ ok: false, field: r.field, message: r.message }, { status: r.status, headers });
    }
    // Queue the Google Sheet row. Never fail the customer's order over it:
    // the job is idempotent and the card in Paramètres shows any miss.
    if (!r.duplicate) {
      await inngest
        .send({
          name: "sheets/order.export",
          data: { orgId, orderId: r.orderId } satisfies AppEvents["sheets/order.export"],
        })
        .catch((e) => logError("Sheets export enqueue failed", e, { route: "public/cod", orgId }));
    }
    return NextResponse.json(
      { ok: true, orderName: r.orderName, total: r.totalCents / 100, currency: r.currency },
      { headers }
    );
  } catch (e) {
    logError("COD form request failed", e, { route: "public/cod" });
    return NextResponse.json(
      { ok: false, message: "La commande n'a pas pu être enregistrée. Réessayez." },
      { status: 500, headers }
    );
  }
}
