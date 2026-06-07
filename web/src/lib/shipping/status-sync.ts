import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getOzonClient, type OzonClient } from "./ozon";
import { deepFindKey } from "./ozon-helpers";
import { mapOzonStatus } from "./ozon-status-map";

// Terminal statuses are never re-polled — caps the work per run.
const TERMINAL: ParcelStatus[] = [
  ParcelStatus.LIVRE,
  ParcelStatus.RETOURNE,
  ParcelStatus.REFUSE,
];

// ── Live OzonExpress tracking call ───────────────────────────────────────────
// ⚠️ CONFIRM: OzonExpress's tracking/status endpoint (path + response shape) is
// not yet verified. While `LIVE_ENABLED` is false the sync NEVER hits a guessed
// endpoint and reports "not configured" — so it can't waste calls or mis-update.
// To go live: confirm the endpoint, set OZON_TRACKING_PATH + STATUS_KEYS, add the
// real strings to ozon-status-map.ts, then flip LIVE_ENABLED to true.
export const LIVE_ENABLED = false;
const OZON_TRACKING_PATH = "tracking"; // CONFIRM exact path
const STATUS_KEYS = ["STATUS", "STATUT", "status", "LAST-STATUS", "PARCEL-STATUS"]; // CONFIRM

export type OzonStatusFetcher = (
  client: OzonClient,
  tracking: string
) => Promise<string | null>;

/** Default live fetcher — posts the tracking number, deep-finds a status field. */
async function fetchOzonStatusLive(
  client: OzonClient,
  tracking: string
): Promise<string | null> {
  const fd = new FormData();
  fd.append("tracking-number", tracking);
  const j = await client.post(OZON_TRACKING_PATH, fd);
  for (const k of STATUS_KEYS) {
    const v = deepFindKey(j, k);
    if (v != null && String(v).trim()) return String(v);
  }
  return null;
}

export interface SyncResult {
  configured: boolean;
  polled: number;
  updated: number;
  failed: number;
  byStatus: Record<string, number>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll OzonExpress for the current status of an org's **active** (non-terminal)
 * parcels and update those whose status changed. Idempotent + fault-tolerant:
 * a single parcel's failure never aborts the batch. Writes ONE summary AuditLog
 * row per run (not one per parcel).
 *
 * SCALING NOTE: this runs synchronously inside a Vercel function (cron or
 * action). Fine for modest volume. If parcel counts grow enough to risk the
 * function timeout, move polling to a durable background queue — that is the
 * Phase 3 (Inngest) work. Do NOT build that here.
 */
export async function syncParcelStatuses(
  orgId: string,
  opts: { fetcher?: OzonStatusFetcher; actorUserId?: string | null } = {}
): Promise<SyncResult> {
  const fetcher = opts.fetcher ?? (LIVE_ENABLED ? fetchOzonStatusLive : null);
  if (!fetcher) {
    return { configured: false, polled: 0, updated: 0, failed: 0, byStatus: {} };
  }

  const odb = getOrgDb(orgId);
  const parcels = await odb.parcel.findMany({
    where: { status: { notIn: TERMINAL }, tracking: { not: null } },
    select: { id: true, tracking: true, status: true },
  });
  if (parcels.length === 0) {
    return { configured: true, polled: 0, updated: 0, failed: 0, byStatus: {} };
  }

  // Per-org credentials from the vault (server-only). Missing creds → not configured.
  let client: OzonClient;
  try {
    client = await getOzonClient(orgId);
  } catch {
    return { configured: false, polled: 0, updated: 0, failed: 0, byStatus: {} };
  }

  let updated = 0;
  let failed = 0;
  const byStatus: Record<string, number> = {};
  const BATCH = 5;

  for (let i = 0; i < parcels.length; i += BATCH) {
    const slice = parcels.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (p) => {
        try {
          const raw = await fetcher(client, p.tracking as string);
          if (raw == null) return;
          const mapped = mapOzonStatus(raw);
          if (!mapped) {
            // Unknown vocabulary → leave unchanged (never guess).
            console.warn(`[status-sync] unknown Ozon status "${raw}" (${p.tracking})`);
            return;
          }
          if (mapped === p.status) return; // no change
          await odb.parcel.update({
            where: { id: p.id },
            data: { status: mapped, lastStatusSyncAt: new Date() },
          });
          updated++;
          byStatus[mapped] = (byStatus[mapped] ?? 0) + 1;
        } catch (e) {
          failed++;
          console.error(`[status-sync] parcel ${p.tracking} failed`, e);
        }
      })
    );
    if (i + BATCH < parcels.length) await sleep(300); // throttle between batches
  }

  if (updated > 0 || failed > 0) {
    await odb.auditLog.create({
      data: {
        orgId,
        actorUserId: opts.actorUserId ?? null,
        action: "shipping.status_synced",
        entity: "Parcel",
        meta: { polled: parcels.length, updated, failed, byStatus },
      },
    });
  }

  return { configured: true, polled: parcels.length, updated, failed, byStatus };
}
