"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { inngest, type AppEvents } from "@/lib/inngest/client";
import { buildGoogleAuthUrl, googleConfigured, revokeGoogleToken, signGoogleState } from "@/lib/integrations/google/oauth";
import {
  createAndLinkSpreadsheet,
  disconnectGoogle,
  failedExports,
  inspectSpreadsheet,
  linkSpreadsheet,
  setSheetsEnabled,
  sheetsOverview,
  type SheetsOverview,
} from "@/lib/sheets/export";
import { parseSpreadsheetId } from "@/lib/sheets/row";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const fail = (e: unknown): { ok: false; message: string } => ({
  ok: false,
  message: e instanceof Error ? e.message.slice(0, 200) : "Échec",
});

async function audit(orgId: string, userId: string | null, action: string) {
  await getOrgDb(orgId).auditLog.create({
    data: { orgId, actorUserId: userId, action, entity: "Integration", entityId: "GOOGLE_SHEETS" },
  });
}

async function done(orgId: string): Promise<Result<SheetsOverview>> {
  revalidatePath("/settings/integrations");
  return { ok: true, data: await sheetsOverview(orgId) };
}

/** Start "Connecter Google": returns Google's consent URL. */
export async function beginGoogleOAuthAction(): Promise<Result<{ url: string }>> {
  const { orgId, userId } = await requireOrgRole("owner");
  if (!googleConfigured()) {
    return { ok: false, message: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants sur le serveur." };
  }
  return { ok: true, data: { url: buildGoogleAuthUrl(signGoogleState(orgId!, userId!)) } };
}

/** Read a pasted sheet link: title + tabs, to choose where rows go. */
export async function inspectSheetAction(input: string): Promise<Result<{ id: string; title: string; tabs: string[] }>> {
  const { orgId } = await requireOrgRole("owner");
  const id = parseSpreadsheetId(input);
  if (!id) return { ok: false, message: "Lien de feuille Google invalide." };
  try {
    const info = await inspectSpreadsheet(orgId!, id);
    return { ok: true, data: { id: info.spreadsheetId, title: info.title, tabs: info.tabs } };
  } catch (e) {
    return fail(e);
  }
}

export async function linkSheetAction(id: string, tab: string): Promise<Result<SheetsOverview>> {
  const { orgId, userId } = await requireOrgRole("owner");
  try {
    await linkSpreadsheet(orgId!, id, tab);
    await audit(orgId!, userId, "sheets.linked");
    return done(orgId!);
  } catch (e) {
    return fail(e);
  }
}

export async function createSheetAction(title: string): Promise<Result<SheetsOverview>> {
  const { orgId, userId } = await requireOrgRole("owner");
  try {
    await createAndLinkSpreadsheet(orgId!, title.trim().slice(0, 100) || "Commandes COD");
    await audit(orgId!, userId, "sheets.created");
    return done(orgId!);
  } catch (e) {
    return fail(e);
  }
}

export async function setSheetsEnabledAction(on: boolean): Promise<Result<SheetsOverview>> {
  const { orgId, userId } = await requireOrgRole("owner");
  try {
    await setSheetsEnabled(orgId!, on);
    await audit(orgId!, userId, on ? "sheets.enabled" : "sheets.disabled");
    return done(orgId!);
  } catch (e) {
    return fail(e);
  }
}

/** Queue again the orders whose row could not be written (last 7 days). */
export async function retryFailedSheetsAction(): Promise<Result<SheetsOverview & { queued: number }>> {
  const { orgId } = await requireOrgRole("owner");
  try {
    const ids = await failedExports(orgId!);
    if (ids.length) {
      await inngest.send(
        ids.map((orderId) => ({
          name: "sheets/order.export",
          data: { orgId: orgId!, orderId } satisfies AppEvents["sheets/order.export"],
        }))
      );
    }
    revalidatePath("/settings/integrations");
    return { ok: true, data: { ...(await sheetsOverview(orgId!)), queued: ids.length } };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectGoogleAction(): Promise<Result<SheetsOverview>> {
  const { orgId, userId } = await requireOrgRole("owner");
  try {
    const refreshToken = await disconnectGoogle(orgId!);
    if (refreshToken) await revokeGoogleToken(refreshToken);
    await audit(orgId!, userId, "integration.disconnected");
    return done(orgId!);
  } catch (e) {
    return fail(e);
  }
}
