import "server-only";

import { IntegrationProvider } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";

import { sanitizeConfig, type CodConfig } from "./config";

/**
 * Per-store COD form settings, kept in Integration(provider COD_FORM).meta.
 * Before the merchant saves anything, the env values (COD_FORM_PRODUCTS,
 * COD_FORM_PIXEL_ID, COD_FORM_THANKYOU_URL) give today's behaviour.
 */

const P = IntegrationProvider.COD_FORM;

const env = () => ({
  COD_FORM_PRODUCTS: process.env.COD_FORM_PRODUCTS,
  COD_FORM_PIXEL_ID: process.env.COD_FORM_PIXEL_ID,
  COD_FORM_THANKYOU_URL: process.env.COD_FORM_THANKYOU_URL,
});

// Small in-memory cache: product pages ask for the config on every view.
const cache = new Map<string, { at: number; config: CodConfig }>();
const TTL_MS = 30_000;

export async function getCodConfig(orgId: string, fresh = false): Promise<CodConfig> {
  const hit = cache.get(orgId);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.config;
  const row = await getOrgDb(orgId).integration.findUnique({
    where: { orgId_provider: { orgId, provider: P } },
    select: { meta: true },
  });
  const config = sanitizeConfig(row?.meta ?? undefined, env());
  cache.set(orgId, { at: Date.now(), config });
  return config;
}

export async function saveCodConfig(orgId: string, input: unknown): Promise<CodConfig> {
  const config = sanitizeConfig(input, env());
  await getOrgDb(orgId).integration.upsert({
    where: { orgId_provider: { orgId, provider: P } },
    create: { orgId, provider: P, status: "connected", connectedAt: new Date(), meta: config as object },
    update: { status: "connected", meta: config as object },
  });
  cache.set(orgId, { at: Date.now(), config });
  return config;
}
