import "server-only";

import { IntegrationProvider } from "@/generated/prisma/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { getOrgDb } from "@/lib/db";
import { googleAccessToken } from "@/lib/integrations/google/oauth";
import { appendRow, createSpreadsheet, getSpreadsheet, type SpreadsheetInfo } from "@/lib/integrations/google/sheets";
import { getShopifyClient } from "@/lib/integrations/shopify/client";
import { getOrgSettings } from "@/lib/org/settings";

import { buildOrderRow, type ExportOrder } from "./row";

/**
 * Orders → the merchant's Google Sheet (what the COD-form apps do).
 * One Integration row per org (provider GOOGLE_SHEETS):
 *   credentialsEnc → { refreshToken }
 *   meta           → account, target sheet + tab, on/off, last export / error
 */

const P = IntegrationProvider.GOOGLE_SHEETS;

export const SHEETS_ACTION = {
  APPENDED: "sheets.row_appended",
  FAILED: "sheets.row_failed",
} as const;

export interface SheetsMeta {
  email?: string | null;
  spreadsheetId?: string | null;
  spreadsheetTitle?: string | null;
  spreadsheetUrl?: string | null;
  tab?: string | null;
  enabled?: boolean;
  lastExport?: { orderName: string; at: string; range: string | null } | null;
  lastError?: { message: string; at: string; orderName?: string } | null;
}

interface Row {
  status: string;
  meta: SheetsMeta;
  refreshToken: string | null;
}

async function load(orgId: string): Promise<Row | null> {
  const r = await getOrgDb(orgId).integration.findUnique({
    where: { orgId_provider: { orgId, provider: P } },
    select: { status: true, meta: true, credentialsEnc: true },
  });
  if (!r) return null;
  let refreshToken: string | null = null;
  if (r.credentialsEnc) {
    try {
      refreshToken = (JSON.parse(decrypt(r.credentialsEnc)) as { refreshToken?: string }).refreshToken ?? null;
    } catch {
      refreshToken = null;
    }
  }
  return { status: r.status, meta: (r.meta ?? {}) as SheetsMeta, refreshToken };
}

async function patchMeta(orgId: string, patch: Partial<SheetsMeta>, status?: string): Promise<SheetsMeta> {
  const cur = (await load(orgId))?.meta ?? {};
  const meta = { ...cur, ...patch };
  await getOrgDb(orgId).integration.update({
    where: { orgId_provider: { orgId, provider: P } },
    data: { meta: meta as object, ...(status ? { status } : {}) },
  });
  return meta;
}

/** Called by the OAuth callback. Keeps the chosen sheet if the merchant reconnects. */
export async function saveGoogleConnection(orgId: string, refreshToken: string, email: string | null): Promise<void> {
  const prev = (await load(orgId))?.meta ?? {};
  const meta: SheetsMeta = { ...prev, email, lastError: null };
  await getOrgDb(orgId).integration.upsert({
    where: { orgId_provider: { orgId, provider: P } },
    create: {
      orgId,
      provider: P,
      status: "connected",
      credentialsEnc: encrypt(JSON.stringify({ refreshToken })),
      connectedAt: new Date(),
      meta: meta as object,
    },
    update: {
      status: "connected",
      credentialsEnc: encrypt(JSON.stringify({ refreshToken })),
      connectedAt: new Date(),
      meta: meta as object,
    },
  });
}

async function token(orgId: string): Promise<string> {
  const row = await load(orgId);
  if (!row?.refreshToken) throw new Error("Compte Google non connecté.");
  try {
    return await googleAccessToken(row.refreshToken);
  } catch (e) {
    if ((e as { revoked?: boolean }).revoked) {
      await patchMeta(
        orgId,
        { lastError: { message: "Accès Google retiré : reconnectez le compte.", at: new Date().toISOString() } },
        "unverified"
      );
    }
    throw e;
  }
}

/** Tabs of a sheet the connected account can open (to pick the target tab). */
export async function inspectSpreadsheet(orgId: string, spreadsheetId: string): Promise<SpreadsheetInfo> {
  return getSpreadsheet(await token(orgId), spreadsheetId);
}

/** Point the export at an existing sheet + tab. */
export async function linkSpreadsheet(orgId: string, spreadsheetId: string, tab: string): Promise<SheetsMeta> {
  const info = await getSpreadsheet(await token(orgId), spreadsheetId);
  if (!info.tabs.includes(tab)) throw new Error(`Onglet « ${tab} » introuvable dans la feuille.`);
  return patchMeta(orgId, {
    spreadsheetId: info.spreadsheetId,
    spreadsheetTitle: info.title,
    spreadsheetUrl: info.url,
    tab,
    lastError: null,
  });
}

/** Create a new sheet in the merchant's Drive and point the export at it. */
export async function createAndLinkSpreadsheet(orgId: string, title: string): Promise<SheetsMeta> {
  const info = await createSpreadsheet(await token(orgId), title);
  return patchMeta(orgId, {
    spreadsheetId: info.spreadsheetId,
    spreadsheetTitle: info.title,
    spreadsheetUrl: info.url,
    tab: info.tabs[0],
    lastError: null,
  });
}

export async function setSheetsEnabled(orgId: string, enabled: boolean): Promise<SheetsMeta> {
  const row = await load(orgId);
  if (enabled && !row?.meta.spreadsheetId) throw new Error("Choisissez d'abord une feuille.");
  return patchMeta(orgId, { enabled });
}

export async function disconnectGoogle(orgId: string): Promise<string | null> {
  const row = await load(orgId);
  await getOrgDb(orgId).integration.update({
    where: { orgId_provider: { orgId, provider: P } },
    data: {
      status: "disconnected",
      credentialsEnc: null,
      connectedAt: null,
      meta: { ...(row?.meta ?? {}), enabled: false, email: null } as object,
    },
  });
  return row?.refreshToken ?? null;
}

export interface SheetsOverview {
  status: "disconnected" | "connected" | "unverified";
  meta: SheetsMeta;
  exported7d: number;
  failed7d: number;
}

export async function sheetsOverview(orgId: string): Promise<SheetsOverview> {
  const row = await load(orgId);
  const odb = getOrgDb(orgId);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [exported7d, failed] = await Promise.all([
    odb.auditLog.count({ where: { action: SHEETS_ACTION.APPENDED, createdAt: { gt: since } } }),
    failedExports(orgId),
  ]);
  const failed7d = failed.length; // orders still missing from the sheet
  const status = !row || !row.refreshToken ? "disconnected" : row.status === "unverified" ? "unverified" : "connected";
  return { status, meta: row?.meta ?? {}, exported7d, failed7d };
}

const ORDER = `
query SheetOrder($id: ID!) {
  order(id: $id) {
    id
    name
    createdAt
    phone
    totalPriceSet { shopMoney { amount } }
    shippingAddress { firstName lastName address1 address2 city phone }
    lineItems(first: 50) { nodes { title variantTitle sku quantity } }
  }
}`;

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  phone: string | null;
  totalPriceSet: { shopMoney: { amount: string } };
  shippingAddress: {
    firstName: string | null;
    lastName: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    phone: string | null;
  } | null;
  lineItems: { nodes: { title: string; variantTitle: string | null; sku: string | null; quantity: number }[] };
}

export function toExportOrder(o: OrderNode): ExportOrder {
  const a = o.shippingAddress;
  return {
    name: o.name,
    createdAt: o.createdAt,
    total: o.totalPriceSet.shopMoney.amount,
    lines: o.lineItems.nodes.map((l) => ({
      title: l.title,
      variantTitle: l.variantTitle,
      sku: l.sku,
      quantity: l.quantity,
    })),
    recipient: [a?.firstName, a?.lastName].filter(Boolean).join(" "),
    address: [a?.address1, a?.address2].filter(Boolean).join(", "),
    phone: a?.phone || o.phone || "",
    city: a?.city ?? "",
  };
}

export type ExportResult =
  | { done: true; orderName: string; range: string | null }
  | { skipped: "not-connected" | "disabled" | "no-sheet" | "already-exported" | "order-missing" };

/**
 * Write one Shopify order as a row. Idempotent: an order already written is
 * never written twice (the audit log is the ledger). Throws on Google /
 * Shopify errors so the background job retries.
 */
export async function exportOrderToSheet(orgId: string, orderGid: string): Promise<ExportResult> {
  const row = await load(orgId);
  if (!row?.refreshToken || row.status === "disconnected") return { skipped: "not-connected" };
  if (!row.meta.enabled) return { skipped: "disabled" };
  if (!row.meta.spreadsheetId || !row.meta.tab) return { skipped: "no-sheet" };

  const odb = getOrgDb(orgId);
  const seen = await odb.auditLog.count({ where: { action: SHEETS_ACTION.APPENDED, entityId: orderGid } });
  if (seen > 0) return { skipped: "already-exported" };

  const { gql } = await getShopifyClient(orgId);
  const d = await gql<{ order: OrderNode | null }>(ORDER, { id: orderGid });
  if (!d.order) return { skipped: "order-missing" };

  const { timezone } = await getOrgSettings(orgId);
  const values = buildOrderRow(toExportOrder(d.order), timezone || "Africa/Casablanca");
  try {
    const range = await appendRow(await token(orgId), row.meta.spreadsheetId, row.meta.tab, values);
    await odb.auditLog.create({
      data: {
        orgId,
        action: SHEETS_ACTION.APPENDED,
        entity: "Order",
        entityId: orderGid,
        meta: { orderName: d.order.name, range } as object,
      },
    });
    await patchMeta(orgId, {
      lastExport: { orderName: d.order.name, at: new Date().toISOString(), range },
      lastError: null,
    });
    return { done: true, orderName: d.order.name, range };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await odb.auditLog.create({
      data: {
        orgId,
        action: SHEETS_ACTION.FAILED,
        entity: "Order",
        entityId: orderGid,
        meta: { orderName: d.order.name, message } as object,
      },
    });
    await patchMeta(orgId, { lastError: { message, at: new Date().toISOString(), orderName: d.order.name } });
    throw e;
  }
}

/** Orders whose export failed for good and were never written, newest first. */
export async function failedExports(orgId: string, days = 7): Promise<string[]> {
  const odb = getOrgDb(orgId);
  const since = new Date(Date.now() - days * 86_400_000);
  const failed = await odb.auditLog.findMany({
    where: { action: SHEETS_ACTION.FAILED, createdAt: { gt: since } },
    select: { entityId: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const ids = [...new Set(failed.map((f) => f.entityId).filter((x): x is string => Boolean(x)))];
  if (!ids.length) return [];
  const done = await odb.auditLog.findMany({
    where: { action: SHEETS_ACTION.APPENDED, entityId: { in: ids } },
    select: { entityId: true },
  });
  const ok = new Set(done.map((d) => d.entityId));
  return ids.filter((id) => !ok.has(id));
}
