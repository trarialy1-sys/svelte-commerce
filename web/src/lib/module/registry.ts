import "server-only";

import { getOrgDb } from "@/lib/db";
import { CustomerSegment, OrderStatus, Role } from "@/generated/prisma/client";
import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { auditConfig } from "@/modules/audit/config";
import { customersConfig } from "@/modules/customers/config";
import { catalogConfig } from "@/modules/catalog/config";
import { stockConfig } from "@/modules/stock/config";
import {
  ordersConfig,
  ordersReadyConfig,
  ordersToConfirmConfig,
} from "@/modules/orders/config";
import type { ModuleConfig } from "./types";

export interface BulkContext {
  /** Clerk user id of the operator running the action. */
  userId?: string | null;
}

export type BulkHandler = (
  orgId: string,
  ids: string[],
  ctx?: BulkContext
) => Promise<{ updated: number }>;

export interface RegistryEntry {
  config: ModuleConfig;
  bulkHandlers?: Record<string, BulkHandler>;
}

/**
 * Tools register their config + bulk handlers here. Server-only — handlers run
 * through getOrgDb(orgId) so every write is org-scoped + RLS-protected.
 */
export const MODULE_REGISTRY: Record<string, RegistryEntry> = {
  customers: {
    config: customersConfig,
    bulkHandlers: {
      mark_vip: async (orgId, ids) => {
        const res = await getOrgDb(orgId).customer.updateMany({
          where: { id: { in: ids } },
          data: { segment: CustomerSegment.VIP },
        });
        return { updated: res.count };
      },
    },
  },
  catalog: { config: catalogConfig },
  stock: { config: stockConfig },
  audit: { config: auditConfig },
  orders: { config: ordersConfig, bulkHandlers: orderBulkHandlers() },
  orders_confirm: {
    config: ordersToConfirmConfig,
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
