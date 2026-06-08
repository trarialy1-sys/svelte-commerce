import "server-only";

import { OrderSource, OrderStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getShopifyClient } from "@/lib/integrations/shopify/client";
import { upsertCustomerFromOrder } from "@/lib/customers/upsert";

interface LineItem {
  sku: string | null;
  quantity: number;
  originalUnitPriceSet: { shopMoney: { amount: string } };
}
interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  totalPriceSet: { shopMoney: { amount: string } };
  shippingAddress: {
    name: string | null;
    phone: string | null;
    address1: string | null;
    city: string | null;
  } | null;
  lineItems: { nodes: LineItem[] };
}
interface OrdersResp {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: OrderNode[];
  };
}

const ORDERS_QUERY = `
query Orders($cursor: String) {
  orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt
      totalPriceSet { shopMoney { amount } }
      shippingAddress { name phone address1 city }
      lineItems(first: 50) {
        nodes { sku quantity originalUnitPriceSet { shopMoney { amount } } }
      }
    }
  }
}`;

/**
 * Map a raw Shopify GraphQL error to a clear, actionable message. Two distinct
 * gates trip people up — and the raw message is appended so the real cause is
 * never hidden.
 */
function friendlyShopifyError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  // Orders carry customer PII (name/phone/address). Reading those fields needs
  // "Protected customer data access" enabled on the app — separate from the
  // read_orders scope.
  if (/protected customer data|approved to access/i.test(msg)) {
    return new Error(
      "L'app Shopify doit être autorisée aux « données client protégées » " +
        "(nom, téléphone, adresse) : activez « Protected customer data access » " +
        `dans l'app, puis reconnectez Shopify. [Shopify: ${msg}]`
    );
  }
  if (/access denied|read_orders|read_all_orders|scope/i.test(msg)) {
    return new Error(
      "Permission « read_orders » non accordée au jeton actuel. Un scope ajouté " +
        "ne s'applique qu'après une RECONNEXION : refaites Paramètres → " +
        `Intégrations → Shopify → Connecter. [Shopify: ${msg}]`
    );
  }
  return new Error(`Erreur Shopify : ${msg}`);
}

export async function importShopifyOrders(
  orgId: string,
  limit = 250
): Promise<{ created: number; skipped: number }> {
  const { gql } = await getShopifyClient(orgId);
  const odb = getOrgDb(orgId);

  let cursor: string | null = null;
  let fetched = 0;
  let created = 0;
  let skipped = 0;

  do {
    let resp: OrdersResp;
    try {
      resp = await gql<OrdersResp>(ORDERS_QUERY, { cursor });
    } catch (e) {
      throw friendlyShopifyError(e);
    }
    // Orders come newest-first. Track how many on this page were genuinely new
    // so a routine re-sync can stop early once it reaches already-imported ones.
    let newThisPage = 0;
    const pageHadNodes = resp.orders.nodes.length > 0;
    for (const o of resp.orders.nodes) {
      if (fetched >= limit) break;
      fetched++;
      try {
        const existing = await odb.order.findUnique({
          where: { orgId_shopifyOrderId: { orgId, shopifyOrderId: o.id } },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }

        // Recipient name from the shipping address (reading the `customer`
        // object would require the separate read_customers scope).
        const name = o.shippingAddress?.name || "Client";
        const phone = (o.shippingAddress?.phone ?? "").replace(/\s/g, "");
        const cityRaw = o.shippingAddress?.city ?? "";
        const address = o.shippingAddress?.address1 ?? "";
        const totalPrice = Number(o.totalPriceSet?.shopMoney?.amount ?? "0") || 0;
        const items = o.lineItems.nodes.filter((li) => li.sku);

        const customerId = await upsertCustomerFromOrder(orgId, {
          name,
          phone,
          city: cityRaw,
        });

        const order = await odb.order.create({
          data: {
            orgId,
            code: o.name,
            shopifyOrderId: o.id,
            customerId,
            cityRaw,
            address,
            phone,
            totalPrice,
            itemsCount: items.length,
            status: OrderStatus.NOUVELLE,
            source: OrderSource.SHOPIFY,
          },
          select: { id: true },
        });

        for (const li of items) {
          await odb.orderItem.create({
            data: {
              orgId,
              orderId: order.id,
              sku: li.sku as string,
              qty: li.quantity,
              unitPrice:
                Number(li.originalUnitPriceSet?.shopMoney?.amount ?? "0") || 0,
            },
          });
        }
        created++;
        newThisPage++;
      } catch {
        skipped++;
      }
    }
    // Caught up: a full page of existing orders means everything newer is
    // already imported (newest-first scan), so stop paginating.
    const caughtUp = pageHadNodes && newThisPage === 0;
    cursor =
      !caughtUp && fetched < limit && resp.orders.pageInfo.hasNextPage
        ? resp.orders.pageInfo.endCursor
        : null;
  } while (cursor);

  return { created, skipped };
}

/** Shape of the relevant fields in an `orders/create` webhook payload (REST). */
interface WebhookOrderPayload {
  id?: number | string;
  name?: string;
  total_price?: string;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  shipping_address?: {
    name?: string | null;
    phone?: string | null;
    address1?: string | null;
    city?: string | null;
  } | null;
  line_items?: { sku?: string | null; quantity?: number; price?: string }[];
}

/**
 * Import a single order delivered by the `orders/create` webhook. Idempotent:
 * dedups on the same `shopifyOrderId` (gid form) used by the bulk import, so a
 * webhook + a later poll never double-create.
 */
export async function importShopifyOrderWebhook(
  orgId: string,
  o: WebhookOrderPayload
): Promise<{ created: boolean }> {
  if (o.id == null) return { created: false };
  const odb = getOrgDb(orgId);
  // Normalize the numeric webhook id to the GraphQL gid the bulk import stores.
  const shopifyOrderId = `gid://shopify/Order/${o.id}`;

  const existing = await odb.order.findUnique({
    where: { orgId_shopifyOrderId: { orgId, shopifyOrderId } },
    select: { id: true },
  });
  if (existing) return { created: false };

  const name =
    o.shipping_address?.name ||
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") ||
    "Client";
  const phone = (o.shipping_address?.phone ?? "").replace(/\s/g, "");
  const cityRaw = o.shipping_address?.city ?? "";
  const address = o.shipping_address?.address1 ?? "";
  const totalPrice = Number(o.total_price ?? "0") || 0;
  const items = (o.line_items ?? []).filter((li) => li.sku);

  const customerId = await upsertCustomerFromOrder(orgId, {
    name,
    phone,
    city: cityRaw,
  });

  const order = await odb.order.create({
    data: {
      orgId,
      code: o.name || shopifyOrderId,
      shopifyOrderId,
      customerId,
      cityRaw,
      address,
      phone,
      totalPrice,
      itemsCount: items.length,
      status: OrderStatus.NOUVELLE,
      source: OrderSource.SHOPIFY,
    },
    select: { id: true },
  });

  for (const li of items) {
    await odb.orderItem.create({
      data: {
        orgId,
        orderId: order.id,
        sku: li.sku as string,
        qty: li.quantity ?? 1,
        unitPrice: Number(li.price ?? "0") || 0,
      },
    });
  }
  return { created: true };
}
