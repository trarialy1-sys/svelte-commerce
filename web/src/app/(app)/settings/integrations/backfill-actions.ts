"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { inngest, type AppEvents } from "@/lib/inngest/client";
import {
  BACKFILL_ACTION,
  backfillCutoff,
  backfillStatus,
  countOldArchivable,
  countOldUnfulfilled,
  type BackfillKind,
  type BackfillStatus,
} from "@/lib/integrations/shopify/backfill-fulfil";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

export interface BackfillOverview extends BackfillStatus {
  cutoff: string;
  pending: number | null;
  /** Old orders already fulfilled but still open (can be archived). */
  archivable: number | null;
}

/** How many old orders are still unfulfilled + the latest run. Owner only. */
export async function backfillOverviewAction(): Promise<Result<BackfillOverview>> {
  const { orgId } = await requireOrgRole("owner");
  const cutoff = backfillCutoff();
  try {
    const [status, pending, archivable] = await Promise.all([
      backfillStatus(orgId!),
      countOldUnfulfilled(orgId!, cutoff).catch(() => null),
      countOldArchivable(orgId!, cutoff).catch(() => null),
    ]);
    return { ok: true, data: { ...status, cutoff, pending, archivable } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}

/**
 * Start the clean-up. `test` = the 50 oldest orders only; `all` = everything
 * older than the cut-off. Owner only, audited, one run at a time.
 */
export async function startBackfillAction(
  mode: "test" | "all",
  kind: BackfillKind = "fulfil"
): Promise<Result<{ runId: string }>> {
  if (kind !== "fulfil" && kind !== "archive") return { ok: false, message: "Action inconnue." };
  const { orgId, userId } = await requireOrgRole("owner");
  const status = await backfillStatus(orgId!);
  if (status.running) return { ok: false, message: "Un nettoyage est déjà en cours." };
  const runId = new Date().toISOString();
  const before = backfillCutoff();
  const remaining = mode === "test" ? 50 : 500_000;
  await getOrgDb(orgId!).auditLog.create({
    data: {
      orgId: orgId!,
      actorUserId: userId,
      action: BACKFILL_ACTION.START,
      entity: "Order",
      entityId: runId,
      meta: { runId, kind, before, mode, fulfilled: 0, skipped: 0, errors: 0 },
    },
  });
  await inngest.send({
    name: "shopify/backfill-fulfil.requested",
    data: {
      orgId: orgId!,
      runId,
      kind,
      before,
      remaining,
      cursor: null,
      fulfilled: 0,
      skipped: 0,
      errors: 0,
    } satisfies AppEvents["shopify/backfill-fulfil.requested"],
  });
  revalidatePath("/settings/integrations");
  return { ok: true, data: { runId } };
}

/** Ask the running clean-up to stop after its current page. Owner only. */
export async function stopBackfillAction(): Promise<Result<null>> {
  const { orgId, userId } = await requireOrgRole("owner");
  const status = await backfillStatus(orgId!);
  if (!status.runId || status.state !== "running") {
    return { ok: false, message: "Aucun nettoyage en cours." };
  }
  await getOrgDb(orgId!).auditLog.create({
    data: {
      orgId: orgId!,
      actorUserId: userId,
      action: BACKFILL_ACTION.STOP,
      entity: "Order",
      entityId: status.runId,
      meta: {
        runId: status.runId,
        kind: status.kind,
        before: status.before,
        fulfilled: status.fulfilled,
        skipped: status.skipped,
        errors: status.errors,
        last: status.last,
      },
    },
  });
  revalidatePath("/settings/integrations");
  return { ok: true, data: null };
}
