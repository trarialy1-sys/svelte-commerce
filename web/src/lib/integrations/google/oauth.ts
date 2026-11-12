import "server-only";

import crypto from "node:crypto";

import { appBaseUrl } from "@/lib/integrations/shopify/oauth";

/**
 * Google OAuth (authorization-code, offline) so a merchant can link their own
 * Google account and we write orders into their sheet — like the COD-form apps.
 *
 * Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (a "Web application" OAuth
 * client in Google Cloud) with the redirect URI below allowed.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

const STATE_TTL_MS = 10 * 60 * 1000;

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return `${appBaseUrl()}/api/integrations/google/oauth/callback`;
}

function stateSecret(): Buffer {
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) throw new Error("ENCRYPTION_KEY is not set.");
  return crypto.createHmac("sha256", Buffer.from(b64, "base64")).update("google-oauth-state").digest();
}

/** Signed state carrying the org (tamper-proof, 10 min). */
export function signGoogleState(orgId: string, userId: string): string {
  const body = Buffer.from(
    JSON.stringify({ orgId, userId, nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGoogleState(token: string | null | undefined): { orgId: string; userId: string } | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      orgId?: string;
      userId?: string;
      ts?: number;
    };
    if (!p.orgId || !p.ts || Date.now() - p.ts > STATE_TTL_MS) return null;
    return { orgId: p.orgId, userId: p.userId ?? "" };
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline", // refresh token: the export runs without the merchant
    prompt: "consent", // always return a refresh token, even on re-connect
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok || !json.access_token) {
    const err = new Error(`Google token: ${json.error ?? `HTTP ${res.status}`}`);
    (err as Error & { revoked?: boolean }).revoked = json.error === "invalid_grant";
    throw err;
  }
  return json;
}

export async function exchangeGoogleCode(code: string): Promise<{ refreshToken: string | null; email: string | null; scope: string }> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri() });
  let email: string | null = null;
  if (t.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString("utf8")) as {
        email?: string;
      };
      email = payload.email ?? null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: t.refresh_token ?? null, email, scope: t.scope ?? "" };
}

/** Short-lived access token from the stored refresh token. */
export async function googleAccessToken(refreshToken: string): Promise<string> {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return t.access_token;
}

/** Best effort: tell Google the merchant disconnected us. */
export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
