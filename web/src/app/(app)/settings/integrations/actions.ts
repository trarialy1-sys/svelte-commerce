"use server";

import { revalidatePath } from "next/cache";

import { IntegrationProvider } from "@/generated/prisma/client";
import {
  disconnectIntegration,
  saveOzon,
  saveShopify,
  testIntegration,
} from "@/lib/integrations/vault";
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
