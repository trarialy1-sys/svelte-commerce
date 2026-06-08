import { NextResponse, type NextRequest } from "next/server";

import { getCredentials, completeShopifyOAuth } from "@/lib/integrations/vault";
import {
  appBaseUrl,
  exchangeCodeForToken,
  isValidShopDomain,
  normalizeShopDomain,
  verifyShopifyHmac,
  verifyState,
} from "@/lib/integrations/shopify/oauth";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirect back to the integrations page with a status code for the UI. */
function back(status: string): NextResponse {
  return NextResponse.redirect(
    `${appBaseUrl()}/settings/integrations?shopify=${status}`
  );
}

/**
 * Shopify OAuth callback. Verifies the signed `state` (carries orgId + shop),
 * the shop domain, and the HMAC, then exchanges the code for an Admin API token
 * and stores it. Never trusts query params without the HMAC + state checks.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = Object.fromEntries(req.nextUrl.searchParams) as Record<
    string,
    string
  >;

  const st = verifyState(params.state);
  if (!st) return back("error_state");

  const shop = normalizeShopDomain(params.shop ?? "");
  if (!isValidShopDomain(shop) || shop !== st.shop) return back("error_shop");
  if (!params.code) return back("error_code");

  const creds = await getCredentials(st.orgId, "SHOPIFY");
  if (!creds?.clientId || !creds?.clientSecret) return back("error_app");

  if (!verifyShopifyHmac(params, creds.clientSecret)) return back("error_hmac");

  try {
    const tok = await exchangeCodeForToken(
      shop,
      creds.clientId,
      creds.clientSecret,
      params.code
    );
    if (!tok.access_token) return back("error_token");
    await completeShopifyOAuth(st.orgId, tok.access_token);
    return back("connected");
  } catch (e) {
    logError("Shopify OAuth callback failed", e, {
      provider: "shopify",
      orgId: st.orgId,
      route: "oauth_callback",
    });
    return back("error_exchange");
  }
}
