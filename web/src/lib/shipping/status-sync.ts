import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getOzonClient, type OzonClient } from "./ozon";
import { mapOzonStatus } from "./ozon-status-map";

// Terminal statuses are never re-polled — caps the work per run.
const TERMINAL: ParcelStatus[] = [
  ParcelStatus.LIVRE,
  ParcelStatus.RETOURNE,
  ParcelStatus.REFUSE,
];

// ── Live OzonExpress tracking call ───────────────────────────────────────────
// Endpoint confirmed: POST customers/{id}/{key}/tracking, form-data
// `tracking-number`. Response: { CHECK_API:{RESULT}, TRACKING:{ RESULT,
// LAST_TRACKING:{ STATUT }, HISTORY:{…} } }. Status lives at
// TRACKING.LAST_TRACKING.STATUT (e.g. "Nouveau Colis").
// NOTE: Ozon also supports bulk tracking (JSON array); we use per-parcel calls
// (confirmed shape) batched + throttled — fine for current volume. Switching to
// bulk is a future optimization if volume grows (→ Phase 3 territory).
export const LIVE_ENABLED = true;
const OZON_TRACKING_PATH = "tracking";

interface TrackingResponse {
  CHECK_API?: { RESULT?: string; MESSAGE?: string };
  TRACKING?: {
    RESULT?: string;
    LAST_TRACKING?: { STATUT?: string };
  };
}

export type OzonStatusFetcher = (
  client: OzonClient,
  tracking: string
) => Promise<string | null>;

/** Live fetcher — returns the parcel's current Ozon STATUT string, or null. */
async function fetchOzonStatusLive(
  client: OzonClient,
  tracking: string
): Promise<string | null> {
  const fd = new FormData();
  fd.append("tracking-number", tracking);
  const j = (await client.post(OZON_TRACKING_PATH, fd)) as TrackingResponse;

  if (j?.CHECK_API?.RESULT === "ERROR") {
    throw new Error(j.CHECK_API.MESSAGE || "OzonExpress: clé API invalide.");
  }
  if (j?.TRACKING?.RESULT !== "SUCCESS") return null; // unknown/invalid tracking
  const statut = j.TRACKING.LAST_TRACKING?.STATUT;
  return statut ? String(statut) : null;
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
  const unknown = new Set<string>();
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
            // Unknown vocabulary → leave unchanged (never guess); surface it.
            unknown.add(raw);
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

  if (updated > 0 || failed > 0 || unknown.size > 0) {
    await odb.auditLog.create({
      data: {
        orgId,
        actorUserId: opts.actorUserId ?? null,
        action: "shipping.status_synced",
        entity: "Parcel",
        meta: {
          polled: parcels.length,
          updated,
          failed,
          byStatus,
          // Unmapped Ozon strings → add them to ozon-status-map.ts.
          ...(unknown.size > 0 ? { unknownStatuses: [...unknown].slice(0, 20) } : {}),
        },
      },
    });
  }

  return { configured: true, polled: parcels.length, updated, failed, byStatus };
}
