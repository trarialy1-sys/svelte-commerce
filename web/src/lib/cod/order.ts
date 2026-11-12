import "server-only";

import { db, getOrgDb } from "@/lib/db";
import { getShopifyClient } from "@/lib/integrations/shopify/client";
import { normalizeShopDomain } from "@/lib/integrations/shopify/oauth";

import {
  COD_ACTION,
  COD_GATEWAY,
  COD_TAG,
  amountToCents,
  centsToAmount,
  isProductEnabled,
  parseEnabledProducts,
  type CodSubmission,
} from "./form";

/** Which org owns this shop (the storefront script only knows the shop). */
export async function resolveOrgByShop(shop: string): Promise<string | null> {
  const domain = normalizeShopDomain(shop);
  if (!domain) return null;
  const rows = await db.integration.findMany({
    where: { provider: "SHOPIFY", status: { not: "disconnected" } },
    select: { orgId: true, meta: true },
  });
  const hit = rows.find(
    (r) => normalizeShopDomain(String((r.meta as { shopDomain?: string } | null)?.shopDomain ?? "")) === domain
  );
  return hit?.orgId ?? null;
}

export function codEnabledProducts(): string[] {
  return parseEnabledProducts(process.env.COD_FORM_PRODUCTS);
}

const VARIANTS = `
query CodVariants($ids: [ID!]!) {
  shop { currencyCode }
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      title
      price
      availableForSale
      product { handle title status }
    }
  }
}`;

const ORDER_CREATE = `
mutation CodOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) {
    order { id name }
    userErrors { field message }
  }
}`;

interface VariantNode {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  product: { handle: string; title: string; status: string };
}

export type CodResult =
  | { ok: true; orderName: string; orderId: string; totalCents: number; currency: string; duplicate?: boolean }
  | { ok: false; status: number; field?: string; message: string };

const CUSTOMER_FIND = `
query CodCustomer($q: String!) { customers(first: 1, query: $q) { nodes { id } } }`;
const CUSTOMER_CREATE = `
mutation CodCustomerCreate($input: CustomerInput!) {
  customerCreate(input: $input) { customer { id } userErrors { field message } }
}`;

type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

/** Shopify only links an order to a customer by id/e-mail, so resolve the phone first. */
async function findOrCreateCustomer(gql: Gql, phone: string, name: string): Promise<string | null> {
  try {
    const found = await gql<{ customers: { nodes: { id: string }[] } }>(CUSTOMER_FIND, {
      q: `phone:"${phone}"`,
    });
    if (found.customers.nodes[0]) return found.customers.nodes[0].id;
    const made = await gql<{ customerCreate: { customer: { id: string } | null } }>(CUSTOMER_CREATE, {
      input: { phone, firstName: name, lastName: "-" },
    });
    return made.customerCreate.customer?.id ?? null;
  } catch {
    return null;
  }
}

const money = (cents: number, currency: string) => ({
  shopMoney: { amount: centsToAmount(cents), currencyCode: currency },
});

/** Save what the visitor typed so far (abandoned-form call-backs). */
export async function saveLead(orgId: string, s: CodSubmission, ip: string | null): Promise<void> {
  const odb = getOrgDb(orgId);
  const n = await odb.auditLog.count({ where: { action: COD_ACTION.LEAD, entityId: s.leadId } });
  if (n >= 5) return;
  await odb.auditLog.create({
    data: {
      orgId,
      action: COD_ACTION.LEAD,
      entity: "CodLead",
      entityId: s.leadId,
      ip,
      meta: { name: s.name, phone: s.phone, city: s.city, address: s.address, items: s.items, utm: s.utm, pageUrl: s.pageUrl } as object,
    },
  });
}

/**
 * Create the Shopify order for a validated submission. Prices come from
 * Shopify, never from the browser. Stock is reserved like any web order.
 */
export async function createCodOrder(
  orgId: string,
  s: CodSubmission,
  ip: string | null
): Promise<CodResult> {
  const odb = getOrgDb(orgId);
  const since = (min: number) => new Date(Date.now() - min * 60_000);

  // Same form submitted twice (double tap, retry) → hand back the same order.
  const recent = await odb.auditLog.findMany({
    where: { action: COD_ACTION.ORDER, entityId: s.phone, createdAt: { gt: since(60) } },
    select: { meta: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const same = recent.find((r) => (r.meta as { leadId?: string } | null)?.leadId === s.leadId);
  if (same) {
    const m = same.meta as { orderName: string; orderId: string; totalCents: number; currency: string };
    return { ok: true, duplicate: true, orderName: m.orderName, orderId: m.orderId, totalCents: m.totalCents, currency: m.currency };
  }
  // Light abuse guard: this endpoint is public.
  if (recent.filter((r) => r.createdAt > since(10)).length >= 3) {
    return { ok: false, status: 429, message: "Trop de commandes. Réessayez dans quelques minutes." };
  }
  if (ip) {
    const fromIp = await odb.auditLog.count({
      where: { action: COD_ACTION.ORDER, ip, createdAt: { gt: since(60) } },
    });
    if (fromIp >= 10) {
      return { ok: false, status: 429, message: "Trop de commandes. Réessayez dans quelques minutes." };
    }
  }

  const { gql } = await getShopifyClient(orgId);
  const data = await gql<{ shop: { currencyCode: string }; nodes: (VariantNode | null)[] }>(VARIANTS, {
    ids: s.items.map((i) => `gid://shopify/ProductVariant/${i.variantId}`),
  });
  const currency = data.shop.currencyCode;
  const enabled = codEnabledProducts();
  const lineItems: Record<string, unknown>[] = [];
  let totalCents = 0;
  for (const [i, item] of s.items.entries()) {
    const v = data.nodes[i];
    if (!v?.id || v.product.status !== "ACTIVE" || !isProductEnabled(enabled, v.product.handle)) {
      return { ok: false, status: 400, field: "items", message: "Ce produit n'est pas disponible." };
    }
    if (!v.availableForSale) {
      return { ok: false, status: 409, field: "items", message: `${v.product.title} (${v.title}) est en rupture de stock.` };
    }
    const unit = amountToCents(v.price);
    totalCents += unit * item.quantity;
    lineItems.push({ variantId: v.id, quantity: item.quantity, priceSet: money(unit, currency), requiresShipping: true });
  }

  const address = {
    firstName: s.name,
    lastName: "-",
    address1: s.address,
    city: s.city,
    zip: "-",
    countryCode: "MA",
    phone: s.phone,
  };
  const customAttributes = [
    { key: "Nom", value: s.name },
    { key: "Téléphone", value: s.phone },
    { key: "Adresse", value: s.address },
    { key: "Ville", value: s.city },
    ...Object.entries(s.utm).map(([key, value]) => ({ key, value })),
    ...(s.pageUrl ? [{ key: "Page", value: s.pageUrl }] : []),
    ...(ip ? [{ key: "IP address", value: ip }] : []),
  ];
  const base = {
    currency,
    lineItems,
    shippingAddress: address,
    billingAddress: address,
    financialStatus: "PENDING",
    buyerAcceptsMarketing: s.newsletter,
    tags: [COD_TAG],
    customAttributes,
    shippingLines: [{ title: "Livraison gratuite", code: "Livraison gratuite", priceSet: money(0, currency) }],
    transactions: [{ kind: "SALE", status: "PENDING", gateway: COD_GATEWAY, amountSet: money(totalCents, currency) }],
  };
  const options = { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false };
  type Created = { orderCreate: { order: { id: string; name: string } | null; userErrors: { field: string[] | null; message: string }[] } };

  // Attach the customer when we can; never lose the order over it — the
  // shipping address always carries the name and phone.
  const customerId = await findOrCreateCustomer(gql, s.phone, s.name);
  const attempt = async (order: Record<string, unknown>): Promise<Created | null> => {
    try {
      return await gql<Created>(ORDER_CREATE, { order, options });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return null;
    }
  };
  let lastError = "";
  let r: Created | null = customerId
    ? await attempt({ ...base, phone: s.phone, customer: { toAssociate: { id: customerId } } })
    : null;
  if (!r?.orderCreate.order) {
    if (r) lastError = r.orderCreate.userErrors.map((e) => e.message).join("; ");
    r = await attempt(base);
  }
  const errs = r?.orderCreate.userErrors ?? [{ field: null, message: lastError }];
  const order = r?.orderCreate.order ?? null;
  if (!order) {
    const message = errs.map((e) => e.message).join("; ").slice(0, 300) || "orderCreate returned nothing";
    await odb.auditLog.create({
      data: { orgId, action: COD_ACTION.FAILED, entity: "CodOrder", entityId: s.phone, ip, meta: { leadId: s.leadId, message, items: s.items } as object },
    });
    const stock = /inventory|stock|available/i.test(message);
    return {
      ok: false,
      status: stock ? 409 : 502,
      message: stock ? "Ce produit n'est plus en stock." : "La commande n'a pas pu être enregistrée. Réessayez.",
    };
  }
  await odb.auditLog.create({
    data: {
      orgId,
      action: COD_ACTION.ORDER,
      entity: "CodOrder",
      entityId: s.phone,
      ip,
      meta: { leadId: s.leadId, orderId: order.id, orderName: order.name, totalCents, currency, utm: s.utm } as object,
    },
  });
  return { ok: true, orderName: order.name, orderId: order.id, totalCents, currency };
}
