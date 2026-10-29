import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getOzonClient, type OzonClient } from "./ozon";
import { isReturnReceived, mapOzonStatus } from "./ozon-status-map";
import { parseTracking, type OzonTracking } from "./ozon-tracking";
import { autoRestockEnabled, restockReturnedParcel } from "./returns";

// ── Live OzonExpress tracking call ───────────────────────────────────────────
// POST customers/{id}/{key}/tracking, form-data `tracking-number` (confirmed
// live — see ozon-tracking.ts for the response shape). Per-parcel calls,
// batched + throttled — fine for current volume.
export const LIVE_ENABLED = true;
const OZON_TRACKING_PATH = "tracking";

/** Stop polling a parcel this long after it was created (stale/lost). */
const MAX_AGE_DAYS = 60;

export type OzonTrackingFetcher = (
  client: OzonClient,
  tracking: string
) => Promise<OzonTracking | null>;

/** Live fetcher — the parcel's last Ozon event, or null when Ozon doesn't know it. */
export async function fetchOzonTracking(
  client: OzonClient,
  tracking: string
): Promise<OzonTracking | null> {
  const fd = new FormData();
  fd.append("tracking-number", tracking);
  return parseTracking(await client.post(OZON_TRACKING_PATH, fd));
}

export interface SyncResult {
  configured: boolean;
  polled: number;
  updated: number;
  failed: number;
  byStatus: Record<string, number>;
  /** Returns that came back to the merchant this run (auto-restocked). */
  returnsRestocked: number;
  /** Per-parcel transitions this run (for parcel/status.changed events). */
  changes: Array<{ tracking: string; from: string; to: string }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EMPTY = (configured: boolean): SyncResult => ({
  configured,
  polled: 0,
  updated: 0,
  failed: 0,
  byStatus: {},
  returnsRestocked: 0,
  changes: [],
});

/**
 * Poll OzonExpress for an org's **open** parcels and record their last event.
 *
 * Open = not delivered, and not a return already back at the merchant. A
 * refused parcel stays open: Ozon later marks it « Retourné » and, once it is
 * physically back, adds the comment « Reçu par client » — at that moment the
 * items go back in stock automatically (`restockReturnedParcel`, once) and the
 * parcel waits for the warehouse check (Retours à vérifier).
 *
 * Idempotent + fault-tolerant: a single parcel's failure never aborts the
 * batch. Writes ONE summary AuditLog row per run.
 */
export async function syncParcelStatuses(
  orgId: string,
  opts: { fetcher?: OzonTrackingFetcher; actorUserId?: string | null } = {}
): Promise<SyncResult> {
  const fetcher = opts.fetcher ?? (LIVE_ENABLED ? fetchOzonTracking : null);
  if (!fetcher) return EMPTY(false);

  const odb = getOrgDb(orgId);
  const since = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
  const parcels = await odb.parcel.findMany({
    where: {
      tracking: { not: null },
      status: { not: ParcelStatus.LIVRE },
      returnReceivedAt: null,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      tracking: true,
      status: true,
      ozonStatus: true,
      ozonComment: true,
      ozonEventAt: true,
    },
  });
  if (parcels.length === 0) return EMPTY(true);

  // Per-org credentials from the vault (server-only). Missing creds → not configured.
  let client: OzonClient;
  try {
    client = await getOzonClient(orgId);
  } catch {
    return EMPTY(false);
  }

  let updated = 0;
  let failed = 0;
  let returnsRestocked = 0;
  const byStatus: Record<string, number> = {};
  const changes: SyncResult["changes"] = [];
  const unknown = new Set<string>();
  const BATCH = 5;

  for (let i = 0; i < parcels.length; i += BATCH) {
    const slice = parcels.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (p) => {
        try {
          const t = await fetcher(client, p.tracking as string);
          if (!t) return;
          const mapped = mapOzonStatus(t.status);
          if (!mapped) {
            // Unknown vocabulary → keep the enum, still record the raw event.
            unknown.add(t.status);
            console.warn(`[status-sync] unknown Ozon status "${t.status}" (${p.tracking})`);
          }
          const received = isReturnReceived(t.status, t.comment);
          const rawChanged =
            t.status !== p.ozonStatus ||
            t.comment !== p.ozonComment ||
            t.eventAt !== p.ozonEventAt;
          const enumChanged = mapped != null && mapped !== p.status;
          if (!rawChanged && !enumChanged && !received) return;

          await odb.parcel.update({
            where: { id: p.id },
            data: {
              ...(enumChanged ? { status: mapped! } : {}),
              ozonStatus: t.status,
              ozonComment: t.comment || null,
              ozonEventAt: t.eventAt,
              lastStatusSyncAt: new Date(),
              ...(received ? { returnReceivedAt: new Date() } : {}),
            },
          });
          if (enumChanged) {
            updated++;
            byStatus[mapped!] = (byStatus[mapped!] ?? 0) + 1;
            changes.push({ tracking: p.tracking as string, from: p.status, to: mapped! });
          }
          // Restock only when we SAW the parcel before it came back (a known
          // earlier Ozon event): a parcel first seen already returned dates
          // from before this tracking existed — its stock was counted by hand.
          if (received && p.ozonStatus != null && autoRestockEnabled()) {
            const r = await restockReturnedParcel(orgId, p.id, opts.actorUserId ?? null);
            if (r.restocked) returnsRestocked++;
          }
        } catch (e) {
          failed++;
          console.error(`[status-sync] parcel ${p.tracking} failed`, e);
        }
      })
    );
    if (i + BATCH < parcels.length) await sleep(300); // throttle between batches
  }

  if (updated > 0 || failed > 0 || unknown.size > 0 || returnsRestocked > 0) {
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
          returnsRestocked,
          // Unmapped Ozon strings → add them to ozon-status-map.ts.
          ...(unknown.size > 0 ? { unknownStatuses: [...unknown].slice(0, 20) } : {}),
        },
      },
    });
  }

  return {
    configured: true,
    polled: parcels.length,
    updated,
    failed,
    byStatus,
    returnsRestocked,
    changes,
  };
}
