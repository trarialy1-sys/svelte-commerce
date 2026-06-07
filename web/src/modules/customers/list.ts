import "server-only";

import { ParcelStatus, Prisma } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { displayPhoneMA } from "@/lib/format";
import type { ListParams, ListResult, Row } from "@/lib/module/types";
import {
  customerAggregates,
  EMPTY_AGG,
  returnRate,
  returnState,
} from "@/lib/customers/aggregates";

const SORTABLE = new Set(["name", "city", "ordersCount", "lastOrderAt", "createdAt"]);
const EXPORT_CAP = 5000;

/** Translate list params into a Prisma `where` for Customer. */
export function buildCustomerWhere(params: ListParams): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};
  const and: Prisma.CustomerWhereInput[] = [];

  if (params.q) {
    and.push({
      OR: [
        { name: { contains: params.q, mode: "insensitive" } },
        { phone: { contains: params.q, mode: "insensitive" } },
        { city: { contains: params.q, mode: "insensitive" } },
      ],
    });
  }

  const f = params.filters;
  if (f.blocked === "true" || f.blocked === "false") {
    and.push({ isBlocked: f.blocked === "true" });
  }
  if (f.hasReturns === "true") {
    and.push({
      orders: {
        some: {
          parcel: { status: { in: [ParcelStatus.RETOURNE, ParcelStatus.REFUSE] } },
        },
      },
    });
  }
  if (f.city) and.push({ city: f.city });
  if (f.tag) and.push({ tags: { has: f.tag } });

  if (and.length) where.AND = and;
  return where;
}

async function fetchCustomers(
  orgId: string,
  params: ListParams,
  appRole: AppRole | null,
  opts: { skip: number; take: number }
): Promise<ListResult> {
  const odb = getOrgDb(orgId);
  const where = buildCustomerWhere(params);
  const orderField = SORTABLE.has(params.sortField) ? params.sortField : "createdAt";

  const [base, total] = await Promise.all([
    odb.customer.findMany({
      where,
      orderBy: { [orderField]: params.sortDir },
      skip: opts.skip,
      take: opts.take,
      select: {
        id: true,
        name: true,
        phone: true,
        city: true,
        tags: true,
        isBlocked: true,
        segment: true,
        ordersCount: true,
        lastOrderAt: true,
        createdAt: true,
      },
    }),
    odb.customer.count({ where }),
  ]);

  const agg = await customerAggregates(
    orgId,
    base.map((c) => c.id)
  );
  const canMoney = meetsOrgRole(appRole, "admin");

  const rows: Row[] = base.map((c) => {
    const a = agg.get(c.id) ?? EMPTY_AGG;
    return {
      ...c,
      phoneDisplay: displayPhoneMA(c.phone),
      delivered: a.delivered,
      returned: a.returned,
      returnRate: Math.round(returnRate(a) * 100),
      returnState: returnState(a),
      // COD money is owner/admin only — omit the key entirely otherwise.
      ...(canMoney ? { codDelivered: a.codDelivered } : {}),
    };
  });

  return { rows, total, page: params.page, pageSize: params.pageSize };
}

/** Paginated Clients list with COD-aware aggregates (COD gated to owner/admin). */
export function listCustomers(
  orgId: string,
  params: ListParams,
  ctx: { appRole: AppRole | null }
): Promise<ListResult> {
  return fetchCustomers(orgId, params, ctx.appRole, {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  });
}

/** Export rows (capped) — same enrichment, no pagination. */
export async function exportCustomers(
  orgId: string,
  params: ListParams,
  ctx: { appRole: AppRole | null }
): Promise<Row[]> {
  const res = await fetchCustomers(orgId, params, ctx.appRole, {
    skip: 0,
    take: EXPORT_CAP,
  });
  return res.rows;
}
