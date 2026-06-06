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
  customer: { firstName: string | null; lastName: string | null } | null;
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
      customer { firstName lastName }
      shippingAddress { name phone address1 city }
      lineItems(first: 50) {
        nodes { sku quantity originalUnitPriceSet { shopMoney { amount } } }
      }
    }
  }
}`;

export async function importShopifyOrders(
  orgId: string,
  limit = 50
): Promise<{ created: number; skipped: number }> {
  const { gql } = await getShopifyClient(orgId);
  const odb = getOrgDb(orgId);

  let cursor: string | null = null;
  let fetched = 0;
  let created = 0;
  let skipped = 0;

  do {
    const resp: OrdersResp = await gql<OrdersResp>(ORDERS_QUERY, { cursor });
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

        const name =
          o.shippingAddress?.name ||
          [o.customer?.firstName, o.customer?.lastName]
            .filter(Boolean)
            .join(" ") ||
          "Client";
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
      } catch {
        skipped++;
      }
    }
    cursor =
      fetched < limit && resp.orders.pageInfo.hasNextPage
        ? resp.orders.pageInfo.endCursor
        : null;
  } while (cursor);

  return { created, skipped };
}
