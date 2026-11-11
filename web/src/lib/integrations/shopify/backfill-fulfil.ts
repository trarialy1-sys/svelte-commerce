import "server-only";

import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "./client";
import { decideFulfilment } from "./fulfillment";

/**
 * One-off clean-up of the history: tens of thousands of old Shopify orders
 * were shipped (or abandoned) long ago but stayed "unfulfilled", so each still
 * reserves its items. `committed` is inflated and any physical count written
 * as on-hand yields a wrong (often negative) sellable quantity.
 *
 * Marking them fulfilled removes the reservation; "available" — the number
 * the storefront sells from and the team keeps right — does not move.
 * No tracking, no customer e-mail. Cancelled orders are skipped.
 *
 * Only orders older than `MIN_AGE_DAYS` are ever touched: recent ones belong
 * to the live rule (fulfil once Ozon picked the parcel up).
 */
export const MIN_AGE_DAYS = 20;
export const BACKFILL_ACTION = {
  START: "maintenance.backfill_fulfil_started",
  PROGRESS: "maintenance.backfill_fulfil_progress",
  STOP: "maintenance.backfill_fulfil_stop",
  DONE: "maintenance.backfill_fulfil_done",
} as const;

/** Latest allowed cut-off (ISO date) — pure, unit-tested. */
export function backfillCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - MIN_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/** Clamp a requested cut-off so it can never reach into the recent window. */
export function clampCutoff(requested: string | undefined, now: Date = new Date()): string {
  const max = backfillCutoff(now);
  if (!requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return max;
  return requested < max ? requested : max;
}

export function backfillQuery(before: string): string {
  return `fulfillment_status:unfulfilled status:open created_at:<${before}`;
}

const OLD_ORDERS = `
query OldUnfulfilled($q: String!, $first: Int!, $after: String) {
  orders(first: $first, after: $after, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      cancelledAt
      fulfillmentOrders(first: 20) { nodes { id status } }
    }
  }
}`;

const FULFILLMENT_CREATE = `
mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id }
    userErrors { field message }
  }
}`;

const COUNT = `
query Count($q: String!) { ordersCount(query: $q, limit: null) { count } }`;

export async function countOldUnfulfilled(orgId: string, before: string): Promise<number> {
  const { gql } = await getShopifyClient(orgId);
  const d = await gql<{ ordersCount: { count: number } }>(COUNT, { q: backfillQuery(before) });
  return d.ordersCount.count;
}

export interface BackfillBatch {
  seen: number;
  fulfilled: number;
  skipped: number;
  errors: string[];
  cursor: string | null;
  done: boolean;
  first?: string;
  last?: string;
}

/** Fulfil one page of old orders (oldest first), resuming after `cursor`. */
export async function backfillBatch(
  orgId: string,
  opts: { before: string; cursor?: string | null; size?: number }
): Promise<BackfillBatch> {
  const { gql } = await getShopifyClient(orgId);
  const size = Math.min(Math.max(opts.size ?? 50, 1), 100);
  const data = await gql<{
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: ({ id: string; name: string } & NonNullable<Parameters<typeof decideFulfilment>[0]>)[];
    };
  }>(OLD_ORDERS, { q: backfillQuery(opts.before), first: size, after: opts.cursor ?? null });

  const out: BackfillBatch = {
    seen: 0,
    fulfilled: 0,
    skipped: 0,
    errors: [],
    cursor: data.orders.pageInfo.endCursor ?? opts.cursor ?? null,
    done: !data.orders.pageInfo.hasNextPage,
    first: data.orders.nodes[0]?.name,
    last: data.orders.nodes[data.orders.nodes.length - 1]?.name,
  };
  for (const o of data.orders.nodes) {
    out.seen++;
    const d = decideFulfilment(o);
    if (d.outcome !== "FULFILL") {
      out.skipped++;
      continue;
    }
    try {
      const r = await gql<{ fulfillmentCreate: { userErrors: { message: string }[] } }>(
        FULFILLMENT_CREATE,
        {
          fulfillment: {
            notifyCustomer: false,
            lineItemsByFulfillmentOrder: d.ids.map((fulfillmentOrderId) => ({ fulfillmentOrderId })),
          },
        }
      );
      const errs = r.fulfillmentCreate?.userErrors ?? [];
      if (errs.length) {
        out.errors.push(`${o.name}: ${errs.map((e) => e.message).join("; ")}`.slice(0, 160));
        out.skipped++;
      } else {
        out.fulfilled++;
      }
    } catch (e) {
      out.errors.push(`${o.name}: ${(e as Error).message}`.slice(0, 160));
      out.skipped++;
    }
  }
  return out;
}

export interface BackfillStatus {
  running: boolean;
  runId: string | null;
  before: string | null;
  fulfilled: number;
  skipped: number;
  errors: number;
  last: string | null;
  updatedAt: string | null;
  state: "idle" | "running" | "stopped" | "done";
}

/** Latest run, read from the audit log (no extra table). */
export async function backfillStatus(orgId: string): Promise<BackfillStatus> {
  const odb = getOrgDb(orgId);
  const rows = await odb.auditLog.findMany({
    where: { action: { in: Object.values(BACKFILL_ACTION) } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { action: true, meta: true, createdAt: true },
  });
  const r = rows[0];
  const idle: BackfillStatus = {
    running: false, runId: null, before: null, fulfilled: 0, skipped: 0, errors: 0,
    last: null, updatedAt: null, state: "idle",
  };
  if (!r) return idle;
  const m = (r.meta ?? {}) as Record<string, unknown>;
  const state =
    r.action === BACKFILL_ACTION.DONE ? "done" : r.action === BACKFILL_ACTION.STOP ? "stopped" : "running";
  // A run with no heartbeat for 30 min is considered dead (so it can be restarted).
  const stale = Date.now() - r.createdAt.getTime() > 30 * 60_000;
  return {
    running: state === "running" && !stale,
    runId: (m.runId as string) ?? null,
    before: (m.before as string) ?? null,
    fulfilled: Number(m.fulfilled ?? 0),
    skipped: Number(m.skipped ?? 0),
    errors: Number(m.errors ?? 0),
    last: (m.last as string) ?? null,
    updatedAt: r.createdAt.toISOString(),
    state: state === "running" && stale ? "stopped" : state,
  };
}

/** True when a stop was requested for this run. */
export async function backfillStopRequested(orgId: string, runId: string): Promise<boolean> {
  const n = await getOrgDb(orgId).auditLog.count({
    where: { action: BACKFILL_ACTION.STOP, entityId: runId },
  });
  return n > 0;
}
