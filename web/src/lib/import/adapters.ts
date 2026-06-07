import "server-only";

import { OrderSource, OrderStatus, Prisma } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { upsertCustomerFromOrder } from "@/lib/customers/upsert";
import { computeStockState } from "@/lib/integrations/shopify/inventory";
import {
  coerceCustomer,
  coerceOrder,
  coerceProduct,
  type CoerceResult,
} from "./coerce";
import type {
  CommitResult,
  DryRunResult,
  ImportEntity,
  MappedRow,
  RowError,
} from "./types";

type Action = "created" | "updated";

interface Engine<T, Ctx> {
  prepare(orgId: string): Promise<Ctx>;
  coerce(raw: MappedRow, ctx: Ctx): CoerceResult<T>;
  keyOf(value: T): string;
  loadExisting(orgId: string, keys: string[]): Promise<Set<string>>;
  commit(orgId: string, value: T, ctx: Ctx): Promise<Action>;
}

// ── Customers ────────────────────────────────────────────────────────────────
const customersEngine: Engine<ReturnType<typeof coerceCustomer>["value"] & object, object> = {
  prepare: async () => ({}),
  coerce: (raw) => coerceCustomer(raw),
  keyOf: (v) => v.phone,
  loadExisting: async (orgId, keys) => {
    const rows = await getOrgDb(orgId).customer.findMany({
      where: { phone: { in: keys } },
      select: { phone: true },
    });
    return new Set(rows.map((r) => r.phone));
  },
  commit: async (orgId, v) => {
    const odb = getOrgDb(orgId);
    const existing = await odb.customer.findUnique({
      where: { orgId_phone: { orgId, phone: v.phone } },
      select: { id: true },
    });
    if (existing) {
      await odb.customer.update({
        where: { orgId_phone: { orgId, phone: v.phone } },
        data: { city: v.city, tags: v.tags, ...(v.nameProvided ? { name: v.name } : {}) },
      });
      return "updated";
    }
    await odb.customer.create({
      data: { orgId, phone: v.phone, name: v.name, city: v.city, tags: v.tags },
    });
    return "created";
  },
};

// ── Products / Variants (Shopify-managed fields preserved) ───────────────────
const productsEngine: Engine<ReturnType<typeof coerceProduct>["value"] & object, object> = {
  prepare: async () => ({}),
  coerce: (raw) => coerceProduct(raw),
  keyOf: (v) => v.sku,
  loadExisting: async (orgId, keys) => {
    const rows = await getOrgDb(orgId).variant.findMany({
      where: { sku: { in: keys } },
      select: { sku: true },
    });
    return new Set(rows.map((r) => r.sku));
  },
  commit: async (orgId, v) => {
    const odb = getOrgDb(orgId);
    const stockState = computeStockState(v.inventoryQty);
    const existing = await odb.variant.findFirst({
      where: { sku: v.sku },
      select: { id: true },
    });
    if (existing) {
      // NEVER touch shopifyVariantId / shopifyInventoryItemId / productId.
      await odb.variant.update({
        where: { id: existing.id },
        data: {
          price: new Prisma.Decimal(v.price),
          inventoryQty: v.inventoryQty,
          stockState,
          ...(v.title ? { title: v.title } : {}),
          ...(v.cost != null ? { cost: new Prisma.Decimal(v.cost) } : {}),
        },
      });
      return "updated";
    }
    const product = await odb.product.create({
      data: { orgId, title: v.title || v.sku, category: v.category },
      select: { id: true },
    });
    await odb.variant.create({
      data: {
        orgId,
        productId: product.id,
        sku: v.sku,
        price: new Prisma.Decimal(v.price),
        title: v.title,
        inventoryQty: v.inventoryQty,
        cost: v.cost != null ? new Prisma.Decimal(v.cost) : null,
        stockState,
      },
    });
    return "created";
  },
};

// ── Orders (reuses SKU tokenizer + customer upsert-by-phone) ─────────────────
interface OrderCtx {
  knownSkus: string[];
  priceBySku: Map<string, Prisma.Decimal>;
}
const ordersEngine: Engine<ReturnType<typeof coerceOrder>["value"] & object, OrderCtx> = {
  prepare: async (orgId) => {
    const variants = await getOrgDb(orgId).variant.findMany({
      select: { sku: true, price: true },
    });
    return {
      knownSkus: variants.map((v) => v.sku),
      priceBySku: new Map(variants.map((v) => [v.sku, v.price])),
    };
  },
  coerce: (raw, ctx) => coerceOrder(raw, ctx.knownSkus),
  keyOf: (v) => v.code,
  loadExisting: async (orgId, keys) => {
    const rows = await getOrgDb(orgId).order.findMany({
      where: { code: { in: keys } },
      select: { code: true },
    });
    return new Set(rows.map((r) => r.code));
  },
  commit: async (orgId, v, ctx) => {
    const odb = getOrgDb(orgId);
    const customerId = await upsertCustomerFromOrder(orgId, {
      name: v.name,
      phone: v.phone,
      city: v.city,
    });
    const mkItems = (orderId: string) =>
      v.skus.map((sku) => ({
        orgId,
        orderId,
        sku,
        qty: 1,
        unitPrice: ctx.priceBySku.get(sku) ?? new Prisma.Decimal(0),
      }));
    const existing = await odb.order.findUnique({
      where: { orgId_code: { orgId, code: v.code } },
      select: { id: true },
    });
    if (existing) {
      await odb.order.update({
        where: { orgId_code: { orgId, code: v.code } },
        data: {
          customerId,
          cityRaw: v.city,
          address: v.address,
          phone: v.phone,
          totalPrice: new Prisma.Decimal(v.totalPrice),
          itemsCount: v.skus.length,
          ...(v.note ? { note: v.note } : {}),
        },
      });
      await odb.orderItem.deleteMany({ where: { orderId: existing.id } });
      for (const it of mkItems(existing.id)) await odb.orderItem.create({ data: it });
      return "updated";
    }
    const order = await odb.order.create({
      data: {
        orgId,
        code: v.code,
        customerId,
        cityRaw: v.city,
        address: v.address,
        phone: v.phone,
        totalPrice: new Prisma.Decimal(v.totalPrice),
        itemsCount: v.skus.length,
        status: OrderStatus.NOUVELLE,
        source: OrderSource.IMPORT,
        note: v.note,
      },
      select: { id: true },
    });
    for (const it of mkItems(order.id)) await odb.orderItem.create({ data: it });
    return "created";
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ENGINES: Record<ImportEntity, Engine<any, any>> = {
  customers: customersEngine,
  products: productsEngine,
  orders: ordersEngine,
};

const MAX_ERRORS = 500;

/** Validate + classify every row WITHOUT writing — for the confirm step. */
export async function dryRunImport(
  orgId: string,
  entity: ImportEntity,
  rows: MappedRow[]
): Promise<DryRunResult> {
  const eng = ENGINES[entity];
  const ctx = await eng.prepare(orgId);
  const coerced = rows.map((r) => eng.coerce(r, ctx));

  const validKeys = coerced
    .filter((c) => c.value && c.errors.length === 0)
    .map((c) => eng.keyOf(c.value));
  const existing = await eng.loadExisting(orgId, [...new Set(validKeys)]);

  let toCreate = 0;
  let toUpdate = 0;
  const errors: RowError[] = [];
  coerced.forEach((c, i) => {
    if (!c.value || c.errors.length) {
      errors.push({ row: i + 1, messages: c.errors.length ? c.errors : ["Ligne invalide"] });
      return;
    }
    if (existing.has(eng.keyOf(c.value))) toUpdate++;
    else toCreate++;
  });

  return {
    total: rows.length,
    toCreate,
    toUpdate,
    errorCount: errors.length,
    errors: errors.slice(0, MAX_ERRORS),
  };
}

/** Idempotent commit. Per-row try/catch; never partial-applies silently. */
export async function commitImport(
  orgId: string,
  entity: ImportEntity,
  rows: MappedRow[],
  actorUserId: string | null | undefined
): Promise<CommitResult> {
  const eng = ENGINES[entity];
  const ctx = await eng.prepare(orgId);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { value, errors: errs } = eng.coerce(rows[i], ctx);
    if (!value || errs.length) {
      failed++;
      errors.push({ row: i + 1, messages: errs.length ? errs : ["Ligne invalide"] });
      continue;
    }
    try {
      const action = await eng.commit(orgId, value, ctx);
      if (action === "created") created++;
      else updated++;
    } catch (e) {
      failed++;
      errors.push({ row: i + 1, messages: [e instanceof Error ? e.message : "Échec"] });
    }
  }

  await getOrgDb(orgId).auditLog.create({
    data: {
      orgId,
      actorUserId: actorUserId ?? null,
      action: `import.${entity}`,
      entity,
      meta: { total: rows.length, created, updated, failed },
    },
  });

  return { created, updated, failed, errors: errors.slice(0, MAX_ERRORS) };
}
