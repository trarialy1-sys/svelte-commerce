"use server";

import { revalidatePath } from "next/cache";

import { IntegrationProvider } from "@/generated/prisma/client";
import {
  disconnectIntegration,
  saveOzon,
  saveShopify,
  saveShopifyApp,
  testIntegration,
} from "@/lib/integrations/vault";
import {
  buildAuthorizeUrl,
  isValidShopDomain,
  signState,
} from "@/lib/integrations/shopify/oauth";
import type { VaultResult } from "@/lib/integrations/types";

const PATH = "/settings/integrations";

export async function connectShopifyAction(input: {
  shopDomain: string;
  adminAccessToken: string;
  apiVersion?: string;
}): Promise<VaultResult> {
  const r = await saveShopify(input);
  revalidatePath(PATH);
  return r;
}

/**
 * Start the Shopify OAuth flow: persist the app's Client ID/secret, then return
 * the authorize URL for the browser to redirect to. The token is captured by
 * the callback route.
 */
export async function beginShopifyOAuthAction(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ ok: boolean; url?: string; message?: string }> {
  try {
    if (!input.clientId.trim() || !input.clientSecret.trim()) {
      return { ok: false, message: "Client ID et secret requis." };
    }
    const { orgId, shop } = await saveShopifyApp(input);
    if (!isValidShopDomain(shop)) {
      return {
        ok: false,
        message: "Domaine invalide — utilisez votre-boutique.myshopify.com.",
      };
    }
    const url = buildAuthorizeUrl(shop, input.clientId.trim(), signState(orgId, shop));
    revalidatePath(PATH);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

export async function connectOzonAction(input: {
  customerId: string;
  apiKey: string;
}): Promise<VaultResult> {
  const r = await saveOzon(input);
  revalidatePath(PATH);
  return r;
}

export async function testIntegrationAction(
  provider: IntegrationProvider
): Promise<VaultResult> {
  const r = await testIntegration(provider);
  revalidatePath(PATH);
  return r;
}

export async function disconnectIntegrationAction(
  provider: IntegrationProvider
): Promise<VaultResult> {
  const r = await disconnectIntegration(provider);
  revalidatePath(PATH);
  return r;
}
