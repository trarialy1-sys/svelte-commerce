import "server-only";

import { db, getOrgDb } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import { startOfLocalDayUTC } from "@/lib/time";
import { syncParcelStatuses } from "@/lib/shipping/status-sync";
import { importShopifyOrders } from "@/lib/orders/import-shopify";
import { getCredentials } from "@/lib/integrations/vault";
import { sendOrgDigest } from "@/lib/digest/send";
import { captureJobError } from "@/lib/observability/jobs";
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
// Scheduled every 2h (no Hobby cron limit on Inngest). The parent lists active
// orgs and fans out one event per org.
const parcelSyncSchedule = inngest.createFunction(
  { id: "parcel-sync-schedule", triggers: [{ cron: "0 */2 * * *" }] },
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
      const result = await step.run("sync", () => syncParcelStatuses(orgId));
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

export const functions = [
  parcelSyncSchedule,
  parcelSyncOrg,
  shopifyImportSchedule,
  shopifyImportOrg,
  digestSchedule,
  digestSendOrg,
];
