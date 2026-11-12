import "server-only";

import { db, getOrgDb } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import { startOfLocalDayUTC } from "@/lib/time";
import { syncParcelStatuses } from "@/lib/shipping/status-sync";
import { discoverParcels } from "@/lib/shipping/discover";
import { syncCatalog } from "@/lib/integrations/shopify/sync";
import { fulfilShippedParcels } from "@/lib/integrations/shopify/fulfillment";
import { syncPackStock } from "@/lib/stock/pack-sync";
import {
  BACKFILL_ACTION,
  backfillBatch,
  backfillStopRequested,
} from "@/lib/integrations/shopify/backfill-fulfil";
import { importShopifyOrders } from "@/lib/orders/import-shopify";
import { getCredentials } from "@/lib/integrations/vault";
import { sendOrgDigest } from "@/lib/digest/send";
import { captureJobError } from "@/lib/observability/jobs";
import { exportOrderToSheet } from "@/lib/sheets/export";
import { purchaseEvent, purchaseEventId, sendCapiEvent } from "@/lib/meta/capi";
import { inngest, type AppEvents } from "./client";

/** Active org ids (global table — system context, no per-org scope needed). */
async function activeOrgIds(): Promise<string[]> {
  const orgs = await db.organization.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}

// ── Parcel-status sync ───────────────────────────────────────────────────────
// Scheduled every hour (no Hobby cron limit on Inngest). The parent lists active
// orgs and fans out one event per org.
const parcelSyncSchedule = inngest.createFunction(
  { id: "parcel-sync-schedule", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const ids = await step.run("list-active-orgs", activeOrgIds);
    if (ids.length) {
      await step.sendEvent(
        "fan-out",
        ids.map((orgId) => ({
          name: "parcel/sync.requested",
          data: { orgId } satisfies AppEvents["parcel/sync.requested"],
        }))
      );
    }
    return { orgs: ids.length };
  }
);

// Per-org sync: concurrency-capped (respect Ozon rate limits), retried by
// Inngest (the sync is idempotent). Emits parcel/status.changed per transition.
const parcelSyncOrg = inngest.createFunction(
  {
    id: "parcel-sync-org",
    concurrency: { limit: 3 },
    retries: 4,
    triggers: [{ event: "parcel/sync.requested" }],
  },
  async ({ event, step }) => {
    const { orgId } = event.data as AppEvents["parcel/sync.requested"];
    try {
      // Parcels shipped outside the app (Google Sheet export) → attach first,
      // so this same run tracks them too.
      await step.run("discover", () => discoverParcels(orgId));
      const result = await step.run("sync", () => syncParcelStatuses(orgId));
      // Shipped parcels → Shopify order fulfilled (reserved → real deduction).
      // Its own step, never fails the sync: a missing scope must not stop
      // tracking and returns.
      await step.run("fulfil", () =>
        fulfilShippedParcels(orgId).catch((e) => ({ error: String((e as Error).message ?? e) }))
      );
      if (result.changes.length) {
        await step.sendEvent(
          "status-changed",
          result.changes.map((c) => ({
            name: "parcel/status.changed",
            data: {
              orgId,
              tracking: c.tracking,
              from: c.from,
              to: c.to,
            } satisfies AppEvents["parcel/status.changed"],
          }))
        );
      }
      return result;
    } catch (err) {
      await captureJobError("parcel-sync-org", err, orgId);
      throw err;
    }
  }
);

// ── Shopify order auto-import ─────────────────────────────────────────────────
// Scheduled every 15 min (Inngest cron — no Hobby limit). Fans out one event
// per active org; the per-org job pulls new Shopify orders. The import is
// idempotent (dedup by shopifyOrderId) and stops early once it reaches orders
// already imported, so frequent runs are cheap.
const shopifyImportSchedule = inngest.createFunction(
  { id: "shopify-import-schedule", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const ids = await step.run("list-active-orgs", activeOrgIds);
    if (ids.length) {
      await step.sendEvent(
        "fan-out",
        ids.map((orgId) => ({
          name: "shopify/import.requested",
          data: { orgId } satisfies AppEvents["shopify/import.requested"],
        }))
      );
    }
    return { orgs: ids.length };
  }
);

const shopifyImportOrg = inngest.createFunction(
  {
    id: "shopify-import-org",
    concurrency: { limit: 3 }, // respect Shopify rate limits
    retries: 3,
    triggers: [{ event: "shopify/import.requested" }],
  },
  async ({ event, step }) => {
    const { orgId } = event.data as AppEvents["shopify/import.requested"];
    // Skip orgs without a connected Shopify token (no error/retry noise).
    const connected = await step.run("connected?", async () => {
      const creds = await getCredentials(orgId, "SHOPIFY");
      return Boolean(creds?.adminAccessToken);
    });
    if (!connected) return { skipped: "not-connected" as const };
    try {
      return await step.run("import", () => importShopifyOrders(orgId));
    } catch (err) {
      await captureJobError("shopify-import-org", err, orgId);
      throw err;
    }
  }
);

// ── Shopify catalog / stock sync ─────────────────────────────────────────────
// Hourly pull of products, variants and stock quantities, so the Stock page
// always shows what Shopify sells (sales, manual edits, returns).
const catalogSyncSchedule = inngest.createFunction(
  { id: "catalog-sync-schedule", triggers: [{ cron: "20 * * * *" }] },
  async ({ step }) => {
    const ids = await step.run("list-active-orgs", activeOrgIds);
    if (ids.length) {
      await step.sendEvent(
        "fan-out",
        ids.map((orgId) => ({
          name: "shopify/catalog.requested",
          data: { orgId } satisfies AppEvents["shopify/catalog.requested"],
        }))
      );
    }
    return { orgs: ids.length };
  }
);

const catalogSyncOrg = inngest.createFunction(
  {
    id: "catalog-sync-org",
    concurrency: { limit: 2 },
    retries: 2,
    triggers: [{ event: "shopify/catalog.requested" }],
  },
  async ({ event, step }) => {
    const { orgId } = event.data as AppEvents["shopify/catalog.requested"];
    const connected = await step.run("connected?", async () => {
      const creds = await getCredentials(orgId, "SHOPIFY");
      return Boolean(creds?.adminAccessToken);
    });
    if (!connected) return { skipped: "not-connected" as const };
    try {
      const synced = await step.run("sync", () => syncCatalog(orgId));
      // Pack stock follows its pieces (fresh quantities from the sync above).
      const packs = await step.run("packs", () =>
        syncPackStock(orgId).catch((e) => ({ error: String((e as Error).message ?? e) }))
      );
      return { ...synced, packs };
    } catch (err) {
      await captureJobError("catalog-sync-org", err, orgId);
      throw err;
    }
  }
);

// ── Owner daily digest ───────────────────────────────────────────────────────
const digestSchedule = inngest.createFunction(
  // ≈ 07:30 Africa/Casablanca; the builder uses the org-tz day window.
  { id: "digest-schedule", triggers: [{ cron: "30 6 * * *" }] },
  async ({ step }) => {
    const ids = await step.run("list-active-orgs", activeOrgIds);
    if (ids.length) {
      await step.sendEvent(
        "fan-out",
        ids.map((orgId) => ({
          name: "digest/send.requested",
          data: { orgId } satisfies AppEvents["digest/send.requested"],
        }))
      );
    }
    return { orgs: ids.length };
  }
);

const digestSendOrg = inngest.createFunction(
  {
    id: "digest-send-org",
    concurrency: { limit: 5 },
    retries: 2,
    triggers: [{ event: "digest/send.requested" }],
  },
  async ({ event, step }) => {
    const { orgId } = event.data as AppEvents["digest/send.requested"];
    // Idempotency guard: if a digest already went out today, a retry must not
    // re-send. Keyed on the org's local day.
    const already = await step.run("sent-today?", async () => {
      const { timezone } = await getOrgSettings(orgId);
      const since = startOfLocalDayUTC(timezone, 0);
      const n = await getOrgDb(orgId).emailLog.count({
        where: { type: "daily_digest", status: "sent", createdAt: { gte: since } },
      });
      return n > 0;
    });
    if (already) return { skipped: "already-sent-today" as const };
    try {
      return await step.run("send", () => sendOrgDigest(orgId));
    } catch (err) {
      await captureJobError("digest-send-org", err, orgId);
      throw err;
    }
  }
);

// ── One-off: fulfil the old unfulfilled Shopify orders ───────────────────────
// Started from Settings → Intégrations (owner). Each invocation handles one
// page (≤50 orders), records a heartbeat, then re-emits itself until the
// history is done, the run's quota is used, or a stop was requested.
const backfillFulfil = inngest.createFunction(
  {
    id: "shopify-backfill-fulfil",
    concurrency: { limit: 1, key: "event.data.orgId" },
    retries: 2,
    triggers: [{ event: "shopify/backfill-fulfil.requested" }],
  },
  async ({ event, step }) => {
    const d = event.data as AppEvents["shopify/backfill-fulfil.requested"];
    const stop = await step.run("stop?", () => backfillStopRequested(d.orgId, d.runId));
    if (stop) {
      // Final marker after any late heartbeat, so the status reads "stopped".
      await step.run("stopped", () =>
        getOrgDb(d.orgId).auditLog.create({
          data: {
            orgId: d.orgId,
            action: BACKFILL_ACTION.STOP,
            entity: "Order",
            entityId: d.runId,
            meta: { runId: d.runId, before: d.before, fulfilled: d.fulfilled, skipped: d.skipped, errors: d.errors },
          },
        })
      );
      return { stopped: true };
    }
    try {
      const size = Math.min(50, d.remaining);
      const b = await step.run("batch", () =>
        backfillBatch(d.orgId, { before: d.before, cursor: d.cursor, size })
      );
      const fulfilled = d.fulfilled + b.fulfilled;
      const skipped = d.skipped + b.skipped;
      const errors = d.errors + b.errors.length;
      const remaining = d.remaining - b.seen;
      const finished = b.done || remaining <= 0 || b.seen === 0;
      await step.run("heartbeat", () =>
        getOrgDb(d.orgId).auditLog.create({
          data: {
            orgId: d.orgId,
            action: finished ? BACKFILL_ACTION.DONE : BACKFILL_ACTION.PROGRESS,
            entity: "Order",
            entityId: d.runId,
            meta: {
              runId: d.runId,
              before: d.before,
              fulfilled,
              skipped,
              errors,
              last: b.last ?? null,
              sampleErrors: b.errors.slice(0, 5),
            },
          },
        })
      );
      if (!finished) {
        await step.sendEvent("next", {
          name: "shopify/backfill-fulfil.requested",
          data: {
            ...d,
            cursor: b.cursor,
            remaining,
            fulfilled,
            skipped,
            errors,
          } satisfies AppEvents["shopify/backfill-fulfil.requested"],
        });
      }
      return { fulfilled, skipped, errors, finished };
    } catch (err) {
      await captureJobError("shopify-backfill-fulfil", err, d.orgId);
      throw err;
    }
  }
);

// ── Google Sheets order export ────────────────────────────────────────────────
// One event per new form order. One at a time per org so rows land in order;
// retried on Google / Shopify errors; idempotent (an order is written once).
const sheetsExportOrder = inngest.createFunction(
  {
    id: "sheets-export-order",
    concurrency: { limit: 1, key: "event.data.orgId" },
    retries: 6,
    triggers: [{ event: "sheets/order.export" }],
  },
  async ({ event, step }) => {
    const { orgId, orderId } = event.data as AppEvents["sheets/order.export"];
    try {
      return await step.run("append-row", () => exportOrderToSheet(orgId, orderId));
    } catch (err) {
      await captureJobError("sheets-export-order", err, orgId);
      throw err;
    }
  }
);

// ── Meta Conversions API ──────────────────────────────────────────────────────
// Server-side Purchase for each form order, deduplicated with the browser pixel
// by event id. Meta also dedups a retried event with the same id.
const metaPurchase = inngest.createFunction(
  {
    id: "meta-purchase-send",
    retries: 5,
    triggers: [{ event: "meta/purchase.send" }],
  },
  async ({ event, step }) => {
    const { orgId, ...input } = event.data as AppEvents["meta/purchase.send"];
    try {
      const r = await step.run("send", () => sendCapiEvent(purchaseEvent(input)));
      await step.run("log", () =>
        getOrgDb(orgId).auditLog.create({
          data: {
            orgId,
            action: "meta.capi_purchase",
            entity: "Order",
            entityId: input.orderId,
            meta: { eventId: purchaseEventId(input.orderName), received: r.received, traceId: r.traceId },
          },
        })
      );
      return r;
    } catch (err) {
      await captureJobError("meta-purchase-send", err, orgId);
      throw err;
    }
  }
);

export const functions = [
  parcelSyncSchedule,
  parcelSyncOrg,
  shopifyImportSchedule,
  shopifyImportOrg,
  catalogSyncSchedule,
  catalogSyncOrg,
  digestSchedule,
  digestSendOrg,
  backfillFulfil,
  sheetsExportOrder,
  metaPurchase,
];
