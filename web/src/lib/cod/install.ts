import "server-only";

import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "@/lib/integrations/shopify/client";
import { appBaseUrl } from "@/lib/integrations/shopify/oauth";

import { COD_ACTION } from "./form";
import { codEnabledProducts } from "./order";

/** Where the storefront loads the form from (needs `write_script_tags`). */
export function codScriptSrc(): string {
  return `${appBaseUrl()}/cod-form.js`;
}

const LIST = `query CodScriptTags { scriptTags(first: 100) { nodes { id src } } }`;
const CREATE = `
mutation CodScriptTagCreate($input: ScriptTagInput!) {
  scriptTagCreate(input: $input) { scriptTag { id } userErrors { field message } }
}`;
const DELETE = `
mutation CodScriptTagDelete($id: ID!) {
  scriptTagDelete(id: $id) { deletedScriptTagId userErrors { field message } }
}`;

async function ourTags(orgId: string): Promise<string[]> {
  const { gql } = await getShopifyClient(orgId);
  const d = await gql<{ scriptTags: { nodes: { id: string; src: string }[] } }>(LIST);
  const src = codScriptSrc();
  return d.scriptTags.nodes.filter((t) => t.src.split("?")[0] === src).map((t) => t.id);
}

export interface CodOverview {
  installed: boolean | null; // null = could not ask Shopify (missing permission)
  products: string[];
  orders7d: number;
  abandoned7d: number;
}

export async function codOverview(orgId: string): Promise<CodOverview> {
  const odb = getOrgDb(orgId);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [installed, orders, leads] = await Promise.all([
    ourTags(orgId).then((t) => t.length > 0).catch(() => null),
    odb.auditLog.findMany({
      where: { action: COD_ACTION.ORDER, createdAt: { gt: since } },
      select: { meta: true },
    }),
    odb.auditLog.findMany({
      where: { action: COD_ACTION.LEAD, createdAt: { gt: since } },
      select: { entityId: true },
      distinct: ["entityId"],
    }),
  ]);
  const ordered = new Set(orders.map((o) => (o.meta as { leadId?: string } | null)?.leadId));
  return {
    installed,
    products: codEnabledProducts(),
    orders7d: orders.length,
    abandoned7d: leads.filter((l) => !ordered.has(l.entityId ?? "")).length,
  };
}

/** Put the form script on the storefront (idempotent). */
export async function installCodScript(orgId: string): Promise<void> {
  if ((await ourTags(orgId)).length > 0) return;
  const { gql } = await getShopifyClient(orgId);
  const r = await gql<{ scriptTagCreate: { userErrors: { message: string }[] } }>(CREATE, {
    input: { src: codScriptSrc(), displayScope: "ONLINE_STORE", cache: false },
  });
  const errs = r.scriptTagCreate.userErrors;
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
}

/** Take the form script off the storefront. */
export async function removeCodScript(orgId: string): Promise<void> {
  const { gql } = await getShopifyClient(orgId);
  for (const id of await ourTags(orgId)) {
    const r = await gql<{ scriptTagDelete: { userErrors: { message: string }[] } }>(DELETE, { id });
    const errs = r.scriptTagDelete.userErrors;
    if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
  }
}
