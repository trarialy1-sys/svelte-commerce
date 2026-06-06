import "server-only";

import { getOrgDb } from "@/lib/db";
import { CustomerSegment } from "@/generated/prisma/client";
import { customersConfig } from "@/modules/customers/config";
import type { ModuleConfig } from "./types";

export type BulkHandler = (
  orgId: string,
  ids: string[]
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
};

export function getModule(key: string): RegistryEntry | undefined {
  return MODULE_REGISTRY[key];
}
