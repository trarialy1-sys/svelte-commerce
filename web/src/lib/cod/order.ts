import "server-only";

import { db, getOrgDb } from "@/lib/db";
import { getShopifyClient } from "@/lib/integrations/shopify/client";
import { normalizeShopDomain } from "@/lib/integrations/shopify/oauth";

import {
  clickUpsellFor,
  formOnProduct,
  offerForProduct,
  tickUpsellsFor,
  type CodConfig,
} from "./config";
import { COD_ACTION, COD_GATEWAY, COD_TAG, amountToCents, centsToAmount, normalizePhone, type CodSubmission } from "./form";
import { discountTitle, quoteCart, type PricedVariant, type PromoCode, type Quote } from "./pricing";
import { getCodConfig } from "./store";

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

/** Products the form is on (for the settings card). */
export async function codEnabledProducts(orgId?: string): Promise<string[]> {
  if (!orgId) return (process.env.COD_FORM_PRODUCTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const c = await getCodConfig(orgId);
  return c.enabled ? c.products : [];
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

const PROMO = `
query CodPromo($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    codeDiscount {
      __typename
      ... on DiscountCodeBasic {
        status
        customerGets {
          value {
            ... on DiscountPercentage { percentage }
            ... on DiscountAmount { amount { amount } appliesOnEachItem }
          }
          items { __typename ... on AllDiscountItems { allItems } }
        }
        minimumRequirement { ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } }
      }
      ... on DiscountCodeFreeShipping {
        status
        minimumRequirement { ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } }
      }
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

const CUSTOMER_FIND = `
query CodCustomer($q: String!) { customers(first: 1, query: $q) { nodes { id } } }`;
const CUSTOMER_CREATE = `
mutation CodCustomerCreate($input: CustomerInput!) {
  customerCreate(input: $input) { customer { id } userErrors { field message } }
}`;

type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

interface VariantNode {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  product: { handle: string; title: string; status: string };
}

export type CodResult =
  | { ok: true; orderName: string; orderId: string; totalCents: number; currency: string; duplicate?: boolean; quote?: Quote }
  | { ok: false; status: number; field?: string; message: string };

export type QuoteResponse =
  | { ok: true; quote: Quote; currency: string }
  | { ok: false; status: number; field?: string; message: string };

/** Shopify only links an order to a customer by id/e-mail, so resolve the phone first. */
async function findOrCreateCustomer(gql: Gql, phone: string, name: string, email: string): Promise<string | null> {
  try {
    const found = await gql<{ customers: { nodes: { id: string }[] } }>(CUSTOMER_FIND, {
      q: `phone:"${phone}"`,
    });
    if (found.customers.nodes[0]) return found.customers.nodes[0].id;
    const made = await gql<{ customerCreate: { customer: { id: string } | null } }>(CUSTOMER_CREATE, {
      input: { phone, firstName: name, lastName: "-", ...(email ? { email } : {}) },
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
      meta: {
        name: s.name,
        phone: s.phone,
        city: s.city,
        address: s.address,
        items: s.items,
        handle: s.handle,
        utm: s.utm,
        pageUrl: s.pageUrl,
      } as object,
    },
  });
}

/** Promo code: the store's own list first, then Shopify's discount codes. */
async function resolvePromo(gql: Gql, config: CodConfig, code: string): Promise<PromoCode | null> {
  const own = config.promoCodes.find((p) => p.code === code);
  if (own) return { ...own, scope: "all" };
  try {
    const d = await gql<{
      codeDiscountNodeByCode: {
        codeDiscount: {
          __typename: string;
          status?: string;
          customerGets?: {
            value: { percentage?: number; amount?: { amount: string }; appliesOnEachItem?: boolean };
            items: { __typename: string };
          };
          minimumRequirement?: { greaterThanOrEqualToSubtotal?: { amount: string } } | null;
        };
      } | null;
    }>(PROMO, { code });
    const cd = d.codeDiscountNodeByCode?.codeDiscount;
    if (!cd || cd.status !== "ACTIVE") return null;
    const min = cd.minimumRequirement?.greaterThanOrEqualToSubtotal?.amount;
    const minSubtotalCents = min ? amountToCents(min) : null;
    if (cd.__typename === "DiscountCodeFreeShipping") return { code, kind: "free_shipping", value: 0, minSubtotalCents };
    if (cd.__typename !== "DiscountCodeBasic" || !cd.customerGets) return null;
    const scope = cd.customerGets.items.__typename === "AllDiscountItems" ? "all" : "main";
    const v = cd.customerGets.value;
    if (typeof v.percentage === "number") return { code, kind: "percent", value: Math.round(v.percentage * 100), minSubtotalCents, scope };
    if (v.amount) return { code, kind: "fixed", value: amountToCents(v.amount.amount), minSubtotalCents, scope };
    return null;
  } catch {
    return null; // no read_discounts permission, or Shopify unavailable
  }
}

/** Live prices for the main lines and every upsell of this product. */
async function priceSubmission(
  orgId: string,
  config: CodConfig,
  s: CodSubmission
): Promise<{ gql: Gql; res: QuoteResponse }> {
  const { gql } = await getShopifyClient(orgId);
  if (!s.handle || !formOnProduct(config, s.handle)) {
    return { gql, res: { ok: false, status: 400, field: "items", message: "Ce produit n'est pas disponible." } };
  }
  const offer = offerForProduct(config, s.handle);
  const ticks = tickUpsellsFor(config, s.handle);
  const click = clickUpsellFor(config, s.handle);
  const ids = [
    ...new Set([...s.items.map((i) => i.variantId), ...ticks.map((t) => t.variantId), ...(click ? [click.variantId] : [])]),
  ];
  const data = await gql<{ shop: { currencyCode: string }; nodes: (VariantNode | null)[] }>(VARIANTS, {
    ids: ids.map((i) => `gid://shopify/ProductVariant/${i}`),
  });
  const variants = new Map<string, PricedVariant>();
  data.nodes.forEach((v, i) => {
    if (!v?.id) return;
    const title = v.title && v.title !== "Default Title" ? `${v.product.title} - ${v.title}` : v.product.title;
    variants.set(ids[i], {
      variantId: ids[i],
      priceCents: amountToCents(v.price),
      title,
      handle: v.product.handle.toLowerCase(),
      available: v.availableForSale && v.product.status === "ACTIVE",
    });
  });

  let promo: PromoCode | null = null;
  if (s.discountCode) {
    if (!config.discountCodes) return { gql, res: { ok: false, status: 400, field: "discount", message: "Code promo non accepté." } };
    promo = await resolvePromo(gql, config, s.discountCode);
    if (!promo) return { gql, res: { ok: false, status: 400, field: "discount", message: "Code promo invalide." } };
  }

  const q = quoteCart(
    config,
    s.handle,
    variants,
    { lines: s.items, tickIds: s.tickIds, click: s.click, promo, city: s.city },
    offer,
    ticks,
    click
  );
  if (!q.ok) return { gql, res: { ok: false, status: 400, field: q.field, message: q.message } };
  return { gql, res: { ok: true, quote: q.quote, currency: data.shop.currencyCode } };
}

/** Summary shown in the form before submitting (same maths as the order). */
export async function quoteSubmission(orgId: string, s: CodSubmission): Promise<QuoteResponse> {
  const config = await getCodConfig(orgId);
  return (await priceSubmission(orgId, config, s)).res;
}

const blocked = (list: string[], v: string | null) => Boolean(v && list.some((x) => x === v));

/**
 * Create the Shopify order for a validated submission. Prices come from
 * Shopify, never from the browser. Stock is reserved like any web order.
 */
export async function createCodOrder(orgId: string, s: CodSubmission, ip: string | null): Promise<CodResult> {
  const config = await getCodConfig(orgId);
  const odb = getOrgDb(orgId);
  const since = (min: number) => new Date(Date.now() - min * 60_000);

  // Same form submitted twice (double tap, retry) → hand back the same order.
  const recent = await odb.auditLog.findMany({
    where: { action: COD_ACTION.ORDER, entityId: s.phone, createdAt: { gt: since(Math.max(60, config.fraud.phoneWindowMin)) } },
    select: { meta: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const same = recent.find((r) => (r.meta as { leadId?: string } | null)?.leadId === s.leadId);
  if (same) {
    const m = same.meta as { orderName: string; orderId: string; totalCents: number; currency: string };
    return { ok: true, duplicate: true, orderName: m.orderName, orderId: m.orderId, totalCents: m.totalCents, currency: m.currency };
  }

  // Fraud rules set by the merchant.
  const blockedPhones = config.fraud.blockedPhones.map((p) => normalizePhone(p) ?? p);
  if (blocked(blockedPhones, s.phone) || blocked(config.fraud.blockedIps, ip)) {
    await odb.auditLog.create({
      data: { orgId, action: COD_ACTION.BLOCKED, entity: "CodOrder", entityId: s.phone, ip, meta: { leadId: s.leadId, reason: "blocklist" } as object },
    });
    return { ok: false, status: 403, message: "Commande impossible. Contactez-nous." };
  }
  const tooMany = { ok: false as const, status: 429, message: "Trop de commandes. Réessayez plus tard." };
  if (recent.filter((r) => r.createdAt > since(config.fraud.phoneWindowMin)).length >= config.fraud.maxPerPhone) return tooMany;
  if (ip) {
    const fromIp = await odb.auditLog.count({
      where: { action: COD_ACTION.ORDER, ip, createdAt: { gt: since(config.fraud.ipWindowMin) } },
    });
    if (fromIp >= config.fraud.maxPerIp) return tooMany;
  }

  const { gql, res } = await priceSubmission(orgId, config, s);
  if (!res.ok) return res;
  const { quote, currency } = res;

  const address = {
    firstName: s.name,
    lastName: "-",
    address1: s.address || "-",
    ...(s.address2 ? { address2: s.address2 } : {}),
    city: s.city || "-",
    zip: "-",
    countryCode: "MA",
    phone: s.phone,
  };
  const customAttributes = [
    { key: "Nom", value: s.name },
    { key: "Téléphone", value: s.phone },
    { key: "Adresse", value: [s.address, s.address2].filter(Boolean).join(", ") },
    { key: "Ville", value: s.city },
    ...(s.email ? [{ key: "E-mail", value: s.email }] : []),
    ...(quote.tier && quote.tier.type !== "none" ? [{ key: "Offre", value: quote.tier.label }] : []),
    ...Object.entries(s.utm).map(([key, value]) => ({ key, value })),
    ...(s.pageUrl ? [{ key: "Page", value: s.pageUrl }] : []),
    ...(ip ? [{ key: "IP address", value: ip }] : []),
  ];
  const lineItems = quote.lines.map((l) => ({
    variantId: `gid://shopify/ProductVariant/${l.variantId}`,
    quantity: l.quantity,
    priceSet: money(l.unitCents, currency),
    requiresShipping: true,
  }));
  const base: Record<string, unknown> = {
    currency,
    lineItems,
    shippingAddress: address,
    billingAddress: address,
    financialStatus: "PENDING",
    buyerAcceptsMarketing: s.newsletter,
    tags: [COD_TAG],
    customAttributes,
    ...(s.note ? { note: s.note } : {}),
    ...(s.email ? { email: s.email } : {}),
    shippingLines: [
      { title: quote.shipping.title, code: quote.shipping.title, priceSet: money(quote.shipping.cents, currency) },
    ],
    transactions: [{ kind: "SALE", status: "PENDING", gateway: COD_GATEWAY, amountSet: money(quote.totalCents, currency) }],
  };
  // Releasit style: one fixed discount whose name lists the reasons.
  if (quote.discountCents > 0) {
    base.discountCode = {
      itemFixedDiscountCode: { code: discountTitle(quote), amountSet: money(quote.discountCents, currency) },
    };
  }
  const options = { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false };
  type Created = { orderCreate: { order: { id: string; name: string } | null; userErrors: { field: string[] | null; message: string }[] } };

  // Attach the customer when we can; never lose the order over it — the
  // shipping address always carries the name and phone.
  const customerId = await findOrCreateCustomer(gql, s.phone, s.name, s.email);
  let lastError = "";
  const attempt = async (order: Record<string, unknown>): Promise<Created | null> => {
    try {
      return await gql<Created>(ORDER_CREATE, { order, options });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return null;
    }
  };
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
      meta: {
        leadId: s.leadId,
        orderId: order.id,
        orderName: order.name,
        totalCents: quote.totalCents,
        currency,
        utm: s.utm,
        handle: s.handle,
        tier: quote.tier?.label ?? null,
        upsells: quote.lines.filter((l) => l.kind !== "main").map((l) => l.kind),
      } as object,
    },
  });
  return { ok: true, orderName: order.name, orderId: order.id, totalCents: quote.totalCents, currency, quote };
}
