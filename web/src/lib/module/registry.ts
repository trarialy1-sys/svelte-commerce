import "server-only";

import { getOrgDb } from "@/lib/db";
import { OrderStatus, Role } from "@/generated/prisma/client";
import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { auditConfig } from "@/modules/audit/config";
import { customersConfig } from "@/modules/customers/config";
import { catalogConfig } from "@/modules/catalog/config";
import { stockConfig } from "@/modules/stock/config";
import {
  ordersConfig,
  ordersConfirmedConfig,
  ordersReadyConfig,
  ordersToConfirmConfig,
} from "@/modules/orders/config";
import { exportCustomers, listCustomers } from "@/modules/customers/list";
import type { ListParams, ListResult, ModuleConfig, Row } from "./types";

export interface BulkContext {
  /** Clerk user id of the operator running the action. */
  userId?: string | null;
}

export type BulkHandler = (
  orgId: string,
  ids: string[],
  ctx?: BulkContext
) => Promise<{ updated: number }>;

export interface ListContext {
  appRole: AppRole | null;
}

export interface RegistryEntry {
  config: ModuleConfig;
  bulkHandlers?: Record<string, BulkHandler>;
  /** Custom list (overrides the generic query) — e.g. computed aggregates. */
  list?: (
    orgId: string,
    params: ListParams,
    ctx: ListContext
  ) => Promise<ListResult>;
  /** Custom export rows (overrides the generic export). */
  exportRows?: (
    orgId: string,
    params: ListParams,
    ctx: ListContext
  ) => Promise<Row[]>;
}

/** Bulk delete for catalogue rows (variants). Order items keep their SKU
 *  string, so deletion is referentially safe; Shopify-synced rows reappear on
 *  the next sync. Admin-gated by the route via the config's bulkAction.minRole. */
const deleteVariants: BulkHandler = async (orgId, ids) => {
  const res = await getOrgDb(orgId).variant.deleteMany({ where: { id: { in: ids } } });
  return { updated: res.count };
};

/** Bulk delete for customers. Notes cascade; orders keep their history with
 *  customerId set null (the relation is optional). Admin-gated. */
const deleteCustomers: BulkHandler = async (orgId, ids) => {
  const res = await getOrgDb(orgId).customer.deleteMany({ where: { id: { in: ids } } });
  return { updated: res.count };
};

/**
 * Tools register their config + bulk handlers here. Server-only — handlers run
 * through getOrgDb(orgId) so every write is org-scoped + RLS-protected.
 */
export const MODULE_REGISTRY: Record<string, RegistryEntry> = {
  customers: {
    config: customersConfig,
    list: listCustomers,
    exportRows: exportCustomers,
    bulkHandlers: { delete: deleteCustomers },
  },
  catalog: { config: catalogConfig, bulkHandlers: { delete: deleteVariants } },
  stock: { config: stockConfig },
  audit: { config: auditConfig },
  orders: { config: ordersConfig, bulkHandlers: orderBulkHandlers() },
  orders_confirm: {
    config: ordersToConfirmConfig,
    bulkHandlers: orderBulkHandlers(),
  },
  orders_confirmed: {
    config: ordersConfirmedConfig,
    bulkHandlers: orderBulkHandlers(),
  },
  orders_ready: { config: ordersReadyConfig, bulkHandlers: orderBulkHandlers() },
};

/** Shared bulk confirmation actions for the orders pipeline tabs. */
function orderBulkHandlers(): Record<string, BulkHandler> {
  return {
    confirm: async (orgId, ids, ctx) => {
      const res = await getOrgDb(orgId).order.updateMany({
        where: { id: { in: ids } },
        data: {
          status: OrderStatus.CONFIRMEE,
          confirmedById: ctx?.userId ?? null,
          confirmedAt: new Date(),
        },
      });
      return { updated: res.count };
    },
    cancel: async (orgId, ids) => {
      const res = await getOrgDb(orgId).order.updateMany({
        where: { id: { in: ids } },
        data: { status: OrderStatus.ANNULEE },
      });
      return { updated: res.count };
    },
    // Hard delete (admin-gated via the config's bulkAction.minRole). Order items
    // and the parcel cascade (onDelete: Cascade in the schema).
    delete: async (orgId, ids) => {
      const res = await getOrgDb(orgId).order.deleteMany({
        where: { id: { in: ids } },
      });
      return { updated: res.count };
    },
  };
}

export function getModule(key: string): RegistryEntry | undefined {
  return MODULE_REGISTRY[key];
}

/** Server-side RBAC gate for a module's read/export/bulk endpoints. */
export function moduleAllowed(
  config: ModuleConfig,
  appRole: AppRole | null
): boolean {
  if (!config.minRole) return true;
  return meetsOrgRole(appRole, config.minRole.toLowerCase() as AppRole);
}

export { Role };
