import { Inngest } from "inngest";

import type { PurchaseInput } from "@/lib/meta/capi";

export const inngest = new Inngest({ id: "partner-os" });

/**
 * Event catalogue (the forward-looking typed scaffold). Inngest v4 dropped the
 * `EventSchemas` client option, so these shapes are the source of truth applied
 * at emit/handle sites. `parcel/status.changed` + `order/confirmed` are defined
 * now so future automation (alerts, follow-ups) can subscribe — no consumers
 * built yet (3.1 scope).
 */
export type AppEvents = {
  "parcel/sync.requested": { orgId: string };
  "parcel/status.changed": {
    orgId: string;
    tracking: string;
    from: string;
    to: string;
  };
  "digest/send.requested": { orgId: string };
  "order/confirmed": { orgId: string; orderId: string };
  "shopify/import.requested": { orgId: string };
  "shopify/catalog.requested": { orgId: string };
  /** Write one Shopify order (gid) as a row in the org's Google Sheet. */
  "sheets/order.export": { orgId: string; orderId: string };
  /** Server-side Meta Purchase for a form order (personal data already hashed). */
  "meta/purchase.send": PurchaseInput & { orgId: string };
  "shopify/backfill-fulfil.requested": {
    orgId: string;
    runId: string;
    before: string;
    /** Orders still allowed in this run (test = 50). */
    remaining: number;
    cursor: string | null;
    fulfilled: number;
    skipped: number;
    errors: number;
  };
};
