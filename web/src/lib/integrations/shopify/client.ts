import "server-only";

import { getCredentials } from "@/lib/integrations/vault";
import { SHOPIFY_API_VERSION, normalizeShopDomain } from "./index";

interface GraphQLError {
  message: string;
  extensions?: { code?: string };
}
interface GqlResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ShopifyClient {
  gql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
  shopDomain: string;
  apiVersion: string;
}

/**
 * Per-org Shopify Admin GraphQL client. Reads the encrypted creds via the vault,
 * retries on THROTTLED / 429 / 5xx with backoff.
 */
export async function getShopifyClient(orgId: string): Promise<ShopifyClient> {
  const creds = await getCredentials(orgId, "SHOPIFY");
  if (!creds) {
    throw new Error("Shopify n'est pas connecté pour cette organisation.");
  }
  const shopDomain = normalizeShopDomain(creds.shopDomain);
  const apiVersion = creds.apiVersion || SHOPIFY_API_VERSION;
  const url = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  async function gql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const MAX = 5;
    for (let attempt = 1; attempt <= MAX; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": creds!.adminAccessToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429 || res.status >= 500) {
        await sleep(800 * attempt);
        continue;
      }

      const json = (await res.json()) as GqlResponse<T>;
      const throttled = json.errors?.some(
        (e) => e.extensions?.code === "THROTTLED"
      );
      if (throttled) {
        await sleep(1500 * attempt);
        continue;
      }
      if (json.errors?.length) {
        throw new Error(
          `Shopify GraphQL: ${json.errors.map((e) => e.message).join("; ")}`
        );
      }
      if (!json.data) throw new Error("Shopify GraphQL: réponse vide.");
      return json.data;
    }
    throw new Error("Shopify GraphQL: limite de débit atteinte, réessayez.");
  }

  return { gql, shopDomain, apiVersion };
}
