import { NextResponse, type NextRequest } from "next/server";

import { getCredentials } from "@/lib/integrations/vault";
import { importShopifyOrderWebhook } from "@/lib/orders/import-shopify";
import { verifyWebhookHmac } from "@/lib/integrations/shopify/webhooks";
import { normalizeShopDomain } from "@/lib/integrations/shopify/oauth";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shopify `orders/create` webhook → near-instant import. The orgId is carried in
 * the query (we set it when registering the webhook), so routing needs no
 * cross-tenant lookup. The raw body HMAC (app client secret) is the auth gate.
 *
 * Always return 200 once authenticated so Shopify doesn't retry-storm; the
 * 15-min Inngest poll is the safety net for anything missed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const orgId = req.nextUrl.searchParams.get("org");
  if (!orgId) return new NextResponse("Bad Request", { status: 400 });

  const raw = await req.text();

  const creds = await getCredentials(orgId, "SHOPIFY");
  if (!creds?.clientSecret) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const hmac = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyWebhookHmac(raw, creds.clientSecret, hmac)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Optional sanity check: the shop that sent this matches the connected one.
  const shop = normalizeShopDomain(
    req.headers.get("x-shopify-shop-domain") ?? ""
  );
  if (creds.shopDomain && shop && shop !== creds.shopDomain) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    await importShopifyOrderWebhook(orgId, JSON.parse(raw));
  } catch (e) {
    logError("Shopify webhook import failed", e, {
      provider: "shopify",
      orgId,
      route: "webhook",
    });
    // Swallow — return 200 so Shopify won't retry-storm; the poll backfills.
  }
  return NextResponse.json({ ok: true });
}
