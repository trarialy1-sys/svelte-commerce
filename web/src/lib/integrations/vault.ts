import "server-only";

import { IntegrationProvider } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { logError } from "@/lib/observability/logger";
import { SHOPIFY_API_VERSION, normalizeShopDomain, testShopify } from "./shopify";
import { registerShopifyWebhooks } from "./shopify/webhooks";
import { testOzon } from "./ozon";
import type {
  AnyCreds,
  OzonCreds,
  ShopifyCreds,
  VaultResult,
} from "./types";

/** Turn a thrown server error into a user-facing message (no stack leaks). */
function vaultErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("ENCRYPTION_KEY")) {
    return "Clé de chiffrement serveur absente (ENCRYPTION_KEY). L'administrateur doit la définir dans les variables d'environnement.";
  }
  return msg || "Échec de l'enregistrement";
}

async function audit(
  orgId: string,
  actorUserId: string,
  action: string,
  provider: IntegrationProvider
) {
  await getOrgDb(orgId).auditLog.create({
    data: {
      orgId,
      actorUserId,
      action,
      entity: "Integration",
      entityId: provider,
    },
  });
}

/**
 * SERVER-ONLY. Decrypt and return a provider's credentials for the org, or null.
 * Imported by tool chunks (1.2–1.4). Never exposed as a server action.
 */
export async function getCredentials(
  orgId: string,
  provider: "SHOPIFY"
): Promise<ShopifyCreds | null>;
export async function getCredentials(
  orgId: string,
  provider: "OZON"
): Promise<OzonCreds | null>;
export async function getCredentials(
  orgId: string,
  provider: IntegrationProvider
): Promise<AnyCreds | null> {
  const row = await getOrgDb(orgId).integration.findUnique({
    where: { orgId_provider: { orgId, provider } },
    select: { credentialsEnc: true },
  });
  if (!row?.credentialsEnc) return null;
  return JSON.parse(decrypt(row.credentialsEnc)) as AnyCreds;
}

export async function saveShopify(input: {
  shopDomain: string;
  adminAccessToken: string;
  apiVersion?: string;
}): Promise<VaultResult> {
  const { orgId, userId } = await requireOrgRole("owner");

  try {
    const creds: ShopifyCreds = {
      shopDomain: normalizeShopDomain(input.shopDomain),
      adminAccessToken: input.adminAccessToken.trim(),
      apiVersion: input.apiVersion?.trim() || SHOPIFY_API_VERSION,
    };

    const test = await testShopify(creds);
    const status = test.ok ? "connected" : "unverified";

    await getOrgDb(orgId!).integration.upsert({
      where: {
        orgId_provider: { orgId: orgId!, provider: IntegrationProvider.SHOPIFY },
      },
      create: {
        orgId: orgId!,
        provider: IntegrationProvider.SHOPIFY,
        credentialsEnc: encrypt(JSON.stringify(creds)),
        status,
        connectedAt: new Date(),
        meta: { shopDomain: creds.shopDomain, shopName: test.shopName ?? null },
      },
      update: {
        credentialsEnc: encrypt(JSON.stringify(creds)),
        status,
        connectedAt: new Date(),
        meta: { shopDomain: creds.shopDomain, shopName: test.shopName ?? null },
      },
    });

    await audit(orgId!, userId!, "integration.connected", IntegrationProvider.SHOPIFY);
    return { ok: test.ok, status, message: test.message };
  } catch (e) {
    return { ok: false, status: "unverified", message: vaultErrorMessage(e) };
  }
}

/**
 * Persist the Shopify OAuth app credentials (Client ID + secret + shop) before
 * starting the authorize redirect. No access token yet — that arrives in the
 * callback. Owner-gated; returns the org + normalized shop for state signing.
 */
export async function saveShopifyApp(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ orgId: string; shop: string }> {
  const { orgId } = await requireOrgRole("owner");
  const shop = normalizeShopDomain(input.shopDomain);
  const creds: ShopifyCreds = {
    shopDomain: shop,
    adminAccessToken: "", // filled by the OAuth callback
    apiVersion: SHOPIFY_API_VERSION,
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret.trim(),
  };
  await getOrgDb(orgId!).integration.upsert({
    where: {
      orgId_provider: { orgId: orgId!, provider: IntegrationProvider.SHOPIFY },
    },
    create: {
      orgId: orgId!,
      provider: IntegrationProvider.SHOPIFY,
      credentialsEnc: encrypt(JSON.stringify(creds)),
      status: "unverified",
      meta: { shopDomain: shop },
    },
    update: {
      credentialsEnc: encrypt(JSON.stringify(creds)),
      status: "unverified",
      meta: { shopDomain: shop },
    },
  });
  return { orgId: orgId!, shop };
}

/**
 * Finish OAuth: store the access token returned by Shopify. Called from the
 * callback route with a trusted orgId (extracted from the signed `state`), so
 * it does NOT go through requireOrgRole.
 */
export async function completeShopifyOAuth(
  orgId: string,
  accessToken: string
): Promise<void> {
  const existing = await getCredentials(orgId, "SHOPIFY");
  if (!existing) throw new Error("App Shopify introuvable.");
  const creds: ShopifyCreds = { ...existing, adminAccessToken: accessToken };
  const test = await testShopify(creds);
  await getOrgDb(orgId).integration.update({
    where: {
      orgId_provider: { orgId, provider: IntegrationProvider.SHOPIFY },
    },
    data: {
      credentialsEnc: encrypt(JSON.stringify(creds)),
      status: test.ok ? "connected" : "unverified",
      connectedAt: new Date(),
      meta: { shopDomain: creds.shopDomain, shopName: test.shopName ?? null },
    },
  });

  // Register the orders/create webhook for near-instant import. Best-effort:
  // never fail the connect if this errors — the 15-min poll still backfills.
  if (test.ok) {
    try {
      await registerShopifyWebhooks(orgId);
    } catch (e) {
      logError("Shopify webhook registration failed", e, {
        provider: "shopify",
        orgId,
        route: "oauth_complete",
      });
    }
  }
}

export async function saveOzon(input: {
  customerId: string;
  apiKey: string;
}): Promise<VaultResult> {
  const { orgId, userId } = await requireOrgRole("owner");

  try {
    const creds: OzonCreds = {
      customerId: input.customerId.trim(),
      apiKey: input.apiKey.trim(),
    };

    const test = await testOzon(creds);
    const status = test.ok
      ? test.unverified
        ? "unverified"
        : "connected"
      : "unverified";

    await getOrgDb(orgId!).integration.upsert({
      where: {
        orgId_provider: { orgId: orgId!, provider: IntegrationProvider.OZON },
      },
      create: {
        orgId: orgId!,
        provider: IntegrationProvider.OZON,
        credentialsEnc: encrypt(JSON.stringify(creds)),
        status,
        connectedAt: new Date(),
        meta: { customerId: creds.customerId },
      },
      update: {
        credentialsEnc: encrypt(JSON.stringify(creds)),
        status,
        connectedAt: new Date(),
        meta: { customerId: creds.customerId },
      },
    });

    await audit(orgId!, userId!, "integration.connected", IntegrationProvider.OZON);
    return { ok: test.ok, status, message: test.message };
  } catch (e) {
    return { ok: false, status: "unverified", message: vaultErrorMessage(e) };
  }
}

export async function testIntegration(
  provider: IntegrationProvider
): Promise<VaultResult> {
  const { orgId } = await requireOrgRole("owner");
  const row = await getOrgDb(orgId!).integration.findUnique({
    where: { orgId_provider: { orgId: orgId!, provider } },
    select: { credentialsEnc: true },
  });
  if (!row?.credentialsEnc) {
    return { ok: false, status: "disconnected", message: "Aucun identifiant enregistré" };
  }
  const creds = JSON.parse(decrypt(row.credentialsEnc));

  let ok = false;
  let status: VaultResult["status"] = "unverified";
  let message = "";
  if (provider === IntegrationProvider.SHOPIFY) {
    const r = await testShopify(creds as ShopifyCreds);
    ok = r.ok;
    status = r.ok ? "connected" : "unverified";
    message = r.message;
  } else if (provider === IntegrationProvider.OZON) {
    const r = await testOzon(creds as OzonCreds);
    ok = r.ok;
    status = r.ok ? "unverified" : "unverified";
    message = r.message;
  } else {
    message = "Fournisseur non testable";
  }

  await getOrgDb(orgId!).integration.update({
    where: { orgId_provider: { orgId: orgId!, provider } },
    data: { status },
  });
  return { ok, status, message };
}

export async function disconnectIntegration(
  provider: IntegrationProvider
): Promise<VaultResult> {
  const { orgId, userId } = await requireOrgRole("owner");
  await getOrgDb(orgId!).integration.update({
    where: { orgId_provider: { orgId: orgId!, provider } },
    data: { credentialsEnc: null, status: "disconnected", connectedAt: null },
  });
  await audit(orgId!, userId!, "integration.disconnected", provider);
  return { ok: true, status: "disconnected", message: "Déconnecté" };
}
