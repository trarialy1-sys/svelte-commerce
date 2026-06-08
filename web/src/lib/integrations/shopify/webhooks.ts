import "server-only";

import crypto from "node:crypto";

import { getShopifyClient } from "./client";
import { appBaseUrl } from "./oauth";

/**
 * Shopify webhooks for near-instant order import. We register an
 * `ORDERS_CREATE` subscription pointing at our callback (with the orgId in the
 * query, so routing needs no cross-tenant lookup); the route verifies the
 * payload HMAC with the app's client secret before trusting it.
 */

/** Callback URL Shopify will POST new orders to (orgId baked in for routing). */
export function webhookCallbackUrl(orgId: string): string {
  return `${appBaseUrl()}/api/webhooks/shopify?org=${encodeURIComponent(orgId)}`;
}

/**
 * Verify the `X-Shopify-Hmac-Sha256` header: base64 HMAC-SHA256 of the RAW body
 * with the app's client secret. Timing-safe.
 */
export function verifyWebhookHmac(
  rawBody: string,
  clientSecret: string,
  headerHmac: string | null | undefined
): boolean {
  if (!headerHmac) return false;
  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(headerHmac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface WebhookSubsResp {
  webhookSubscriptions: {
    edges: { node: { topic: string; endpoint: { callbackUrl?: string } } }[];
  };
}

const LIST_QUERY = `
query {
  webhookSubscriptions(first: 100) {
    edges {
      node {
        topic
        endpoint { ... on WebhookHttpEndpoint { callbackUrl } }
      }
    }
  }
}`;

const CREATE_MUTATION = `
mutation Create($url: URL!) {
  webhookSubscriptionCreate(
    topic: ORDERS_CREATE
    webhookSubscription: { callbackUrl: $url, format: JSON }
  ) {
    userErrors { message }
    webhookSubscription { id }
  }
}`;

/**
 * Ensure an ORDERS_CREATE webhook is registered for this org's shop (idempotent
 * — skips if one already points at our callback). Best-effort: callers should
 * not fail the connect flow if this throws.
 */
export async function registerShopifyWebhooks(orgId: string): Promise<void> {
  const { gql } = await getShopifyClient(orgId);
  const callbackUrl = webhookCallbackUrl(orgId);

  const existing = await gql<WebhookSubsResp>(LIST_QUERY);
  const already = existing.webhookSubscriptions.edges.some(
    (e) =>
      e.node.topic === "ORDERS_CREATE" &&
      e.node.endpoint?.callbackUrl === callbackUrl
  );
  if (already) return;

  await gql(CREATE_MUTATION, { url: callbackUrl });
}
