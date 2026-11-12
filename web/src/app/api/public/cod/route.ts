import { NextResponse, type NextRequest } from "next/server";

import { publicConfig } from "@/lib/cod/config";
import { allowedOrigins, validateSubmission } from "@/lib/cod/form";
import { createCodOrder, quoteSubmission, resolveOrgByShop, saveLead, upsellInfo } from "@/lib/cod/order";
import { logFormOpen } from "@/lib/cod/stats";
import { centsToAmount } from "@/lib/cod/form";
import { getCodConfig } from "@/lib/cod/store";
import { inngest, type AppEvents } from "@/lib/inngest/client";
import { buildPurchaseInput, capiConfigured } from "@/lib/meta/capi";
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
  const handle = (req.nextUrl.searchParams.get("handle") ?? "").toLowerCase();
  const headers = cors(req, shop);
  try {
    const orgId = handle ? await resolveOrgByShop(shop) : null;
    if (!orgId) return NextResponse.json({ enabled: false }, { headers });
    const pc = publicConfig(await getCodConfig(orgId), handle);
    const ids = pc.enabled ? [...pc.tickUpsells.map((u) => u.variantId), ...(pc.clickUpsell ? [pc.clickUpsell.variantId] : [])] : [];
    const upsellProducts = ids.length ? await upsellInfo(orgId, ids).catch(() => ({})) : {};
    return NextResponse.json({ ...pc, upsellProducts }, { headers });
  } catch (e) {
    logError("COD form config failed", e, { route: "public/cod" });
    return NextResponse.json({ enabled: false }, { headers });
  }
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
  // Funnel: the form was opened (one per visitor and product per 30 min).
  if (body.action === "open") {
    try {
      const orgId = await resolveOrgByShop(shop);
      const handle = String(body.handle ?? "").toLowerCase().slice(0, 255);
      const ip = clientIp(req);
      if (orgId && handle) await logFormOpen(orgId, handle, ip, (body.utm ?? {}) as Record<string, unknown>);
    } catch (e) {
      logError("COD form open log failed", e, { route: "public/cod" });
    }
    return NextResponse.json({ ok: true }, { headers });
  }
  if (body.action === "quote") {
    // The summary needs no contact details yet.
    body.name ||= "--";
    body.phone ||= "0600000000";
    body.city ||= "";
    body.address ||= "---";
    body.leadId ||= "quote0000";
  }
  try {
    const orgId = await resolveOrgByShop(shop);
    if (!orgId) {
      return NextResponse.json({ ok: false, message: "Boutique inconnue." }, { status: 404, headers });
    }
    const config = await getCodConfig(orgId);
    const v = validateSubmission(body, {
      required: body.action === "order" ? config.fields.filter((f) => f.show && f.required).map((f) => f.key) : [],
      maxQty: config.fraud.maxQty,
    });
    if (!v.ok) {
      return NextResponse.json({ ok: false, field: v.field, message: v.message }, { status: 400, headers });
    }
    const ip = clientIp(req);
    if (body.action === "lead") {
      await saveLead(orgId, v.value, ip);
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.action === "quote") {
      const q = await quoteSubmission(orgId, v.value);
      if (!q.ok) return NextResponse.json({ ok: false, field: q.field, message: q.message }, { status: q.status, headers });
      const qt = q.quote;
      return NextResponse.json(
        {
          ok: true,
          currency: q.currency,
          subtotal: Number(centsToAmount(qt.subtotalCents)),
          discounts: qt.discounts.map((d) => ({ label: d.label, amount: Number(centsToAmount(d.cents)) })),
          discount: Number(centsToAmount(qt.discountCents)),
          shipping: { title: qt.shipping.title, amount: Number(centsToAmount(qt.shipping.cents)) },
          fee: qt.fee ? { title: qt.fee.title, amount: Number(centsToAmount(qt.fee.cents)) } : null,
          total: Number(centsToAmount(qt.totalCents)),
          tier: qt.tier?.label ?? null,
        },
        { headers }
      );
    }
    if (body.action !== "order") {
      return NextResponse.json({ ok: false, message: "Requête invalide." }, { status: 400, headers });
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
      // Server-side Meta Purchase (same event id as the browser pixel → deduplicated).
      if (capiConfigured()) {
        const s = v.value;
        await inngest
          .send({
            name: "meta/purchase.send",
            data: {
              orgId,
              ...buildPurchaseInput({
                orderName: r.orderName,
                orderId: r.orderId,
                totalCents: r.totalCents,
                currency: r.currency,
                variantIds: s.items.map((i) => i.variantId),
                numItems: s.items.reduce((n, i) => n + i.quantity, 0),
                phone: s.phone,
                city: s.city,
                ip,
                userAgent: req.headers.get("user-agent"),
                fbp: body.fbp,
                fbc: body.fbc,
                sourceUrl: s.pageUrl,
              }),
            } satisfies AppEvents["meta/purchase.send"],
          })
          .catch((e) => logError("Meta CAPI enqueue failed", e, { route: "public/cod", orgId }));
      }
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
