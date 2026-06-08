import "server-only";

import crypto from "node:crypto";

import { normalizeShopDomain } from "./index";

/**
 * Shopify OAuth (authorization-code grant) for the modern Dev Dashboard apps.
 * Legacy custom apps (paste-a-`shpat_`-token) can no longer be created as of
 * 2026-01-01, so this is the supported way to obtain an Admin API token.
 *
 * Pure helpers here (no DB) so they're unit-testable; the route + vault wire
 * them to storage.
 */

export const OAUTH_SCOPES =
  "read_orders,read_products,read_locations,read_inventory,write_inventory,write_products";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Stable public base URL of this app (where Shopify redirects back). */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://svelte-commerce-rosy.vercel.app")
  ).replace(/\/$/, "");
}

/** The exact redirect URI the merchant must whitelist in their Shopify app. */
export function shopifyRedirectUri(): string {
  return `${appBaseUrl()}/api/integrations/shopify/oauth/callback`;
}

/** Guard against SSRF: only ever talk to *.myshopify.com hosts. */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

/** Derive a dedicated signing subkey from the master ENCRYPTION_KEY. */
function stateSecret(): Buffer {
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) throw new Error("ENCRYPTION_KEY is not set.");
  return crypto
    .createHmac("sha256", Buffer.from(b64, "base64"))
    .update("shopify-oauth-state")
    .digest();
}

interface StatePayload {
  orgId: string;
  shop: string;
  nonce: string;
  ts: number;
}

/** Signed, self-contained `state` (carries orgId + shop, tamper-proof). */
export function signState(orgId: string, shop: string): string {
  const payload: StatePayload = {
    orgId,
    shop,
    nonce: crypto.randomBytes(8).toString("hex"),
    ts: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

/** Verify a `state` token; returns the bound orgId + shop, or null. */
export function verifyState(
  token: string | null | undefined
): { orgId: string; shop: string } | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.orgId || !payload.shop || !payload.ts) return null;
  if (Date.now() - payload.ts > STATE_TTL_MS) return null;
  return { orgId: payload.orgId, shop: payload.shop };
}

/** Build the Shopify authorize URL the merchant is sent to. */
export function buildAuthorizeUrl(
  shop: string,
  clientId: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: OAUTH_SCOPES,
    redirect_uri: shopifyRedirectUri(),
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the HMAC Shopify appends to the callback query, per its spec: sort the
 * params (excluding `hmac`/`signature`), join `k=v&…`, HMAC-SHA256 with the
 * app's client secret, compare hex (timing-safe).
 */
export function verifyShopifyHmac(
  query: Record<string, string>,
  clientSecret: string
): boolean {
  const { hmac, signature: _signature, ...rest } = query;
  void _signature;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");
  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Exchange the authorization code for a permanent Admin API access token. */
export async function exchangeCodeForToken(
  shop: string,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{ access_token: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Échange du code OAuth échoué (HTTP ${res.status}).`);
  }
  return (await res.json()) as { access_token: string; scope: string };
}

export { normalizeShopDomain };
