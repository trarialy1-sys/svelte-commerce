import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export { db };

/**
 * Tenant models = every model EXCEPT the global/identity ones
 * (Organization, User, CityCatalog). These are the tables with an `orgId`
 * column and RLS enabled.
 */
const TENANT_MODELS = new Set<string>([
  "Membership",
  "Integration",
  "Product",
  "Variant",
  "Customer",
  "CustomerNote",
  "Order",
  "OrderItem",
  "Parcel",
  "DeliveryNote",
  "DeliveryNoteParcel",
  "CityAlias",
  "NeighAlias",
  "FinanceSettings",
  "AuditLog",
]);

type AnyArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

/** Mutate `args` to scope the operation to `orgId` (app-layer guard). */
function injectOrgId(operation: string, args: AnyArgs, orgId: string): void {
  switch (operation) {
    case "findMany":
    case "findFirst":
    case "findFirstOrThrow":
    case "findUnique":
    case "findUniqueOrThrow":
    case "count":
    case "aggregate":
    case "groupBy":
    case "updateMany":
    case "deleteMany":
    case "update":
    case "delete":
      args.where = { ...(args.where ?? {}), orgId };
      break;
    case "create":
      args.data = { ...((args.data as Record<string, unknown>) ?? {}), orgId };
      break;
    case "createMany":
      if (Array.isArray(args.data)) {
        args.data = args.data.map((d) => ({ ...d, orgId }));
      } else {
        args.data = { ...((args.data as Record<string, unknown>) ?? {}), orgId };
      }
      break;
    case "upsert":
      args.where = { ...(args.where ?? {}), orgId };
      args.create = { ...(args.create ?? {}), orgId };
      break;
    default:
      break;
  }
}

/**
 * The single, org-scoped entry point for tenant data.
 *
 * Returns an extended Prisma client where every tenant-model operation:
 *  - is filtered/stamped with `orgId` (app-layer guard), and
 *  - runs inside a transaction that sets the `app.current_org_id` GUC, so the
 *    database-level RLS policy also passes (and, crucially, isn't blocked by
 *    FORCE RLS, which returns zero rows when the GUC is unset).
 *
 * Non-tenant models (Organization, User, CityCatalog) pass straight through.
 */
export function getOrgDb(orgId: string) {
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }
          injectOrgId(operation, args as AnyArgs, orgId);
          // Set the RLS GUC and run the query in one transaction so they share
          // a connection (documented Prisma RLS pattern).
          const [, result] = await db.$transaction([
            db.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

/**
 * Run `fn` inside a transaction with the org RLS GUC set. Use for multi-step
 * mutations that need atomicity + the database-level isolation net. The passed
 * `tx` is the raw transaction client (no app-layer orgId injection), but RLS
 * WITH CHECK still enforces `orgId = app.current_org_id` on writes.
 */
export async function withOrg<T>(
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    return fn(tx);
  });
}
