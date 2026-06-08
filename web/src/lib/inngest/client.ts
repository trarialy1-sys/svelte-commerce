import { Inngest } from "inngest";

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
};
