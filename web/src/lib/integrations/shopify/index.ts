import type { ShopifyCreds } from "../types";

// Current stable Shopify Admin API version (configurable; stored in creds).
export const SHOPIFY_API_VERSION = "2026-01";

/**
 * Resolve any pasted form of a store reference to its `*.myshopify.com` domain,
 * which is what the Admin API requires. Handles:
 *   - https://admin.shopify.com/store/<handle>/...  → <handle>.myshopify.com
 *   - <handle>                                      → <handle>.myshopify.com
 *   - https://<handle>.myshopify.com/               → <handle>.myshopify.com
 *   - a custom storefront domain                    → passed through as-is
 */
export function normalizeShopDomain(input: string): string {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, "");

  // Shopify admin URL: admin.shopify.com/store/<handle>
  const admin = s.match(/^admin\.shopify\.com\/store\/([^/?#]+)/);
  if (admin) return `${admin[1]}.myshopify.com`;

  // Drop any path / query / trailing slash.
  s = s.replace(/[/?#].*$/, "");
  if (!s) return s;

  // Bare store handle (no dot) → add the canonical suffix.
  if (!s.includes(".")) return `${s}.myshopify.com`;

  return s;
}

export interface ShopifyTestResult {
  ok: boolean;
  message: string;
  shopName?: string;
}

/**
 * Non-mutating auth check: GET /admin/api/{version}/shop.json with the token.
 * 200 → valid (capture shop name); 401/403 → invalid creds.
 */
export async function testShopify(
  creds: ShopifyCreds
): Promise<ShopifyTestResult> {
  const domain = normalizeShopDomain(creds.shopDomain);
  const version = creds.apiVersion || SHOPIFY_API_VERSION;
  const url = `https://${domain}/admin/api/${version}/shop.json`;
  try {
    const res = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": creds.adminAccessToken,
        Accept: "application/json",
      },
      // Short timeout via AbortSignal to avoid hanging the action.
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) {
      const data = (await res.json()) as { shop?: { name?: string } };
      return { ok: true, message: "Connexion réussie", shopName: data.shop?.name };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Token invalide ou permissions insuffisantes" };
    }
    return { ok: false, message: `Réponse inattendue de Shopify (${res.status})` };
  } catch {
    return { ok: false, message: "Impossible de joindre le domaine Shopify" };
  }
}
