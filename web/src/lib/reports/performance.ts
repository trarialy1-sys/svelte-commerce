import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb, withOrg } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import { PARCEL_ALL, PARCEL_DELIVERED, PARCEL_PROBLEM } from "@/lib/parcel-status";
import { dayInTz } from "@/lib/time";
import type { DateRange, ReportGranularity, ReportPeriod } from "./period";

/**
 * Performance-over-time totals for a window. Reuses the COD-by-status
 * definitions (`PARCEL_*`): orders by `createdAt`; delivered / returned by the
 * status-transition time (`updatedAt`), mirroring Finance-light so the numbers
 * reconcile. `verse` is recorded remittances — never an estimate.
 */
export interface PerfTotals {
  orders: number;
  delivered: number; // count
  returned: number; // count
  deliveryRate: number; // % of resolved parcels delivered (count-weighted)
  returnRate: number; // % money-weighted (codRetours / (codLivre + codRetours))
  codCree: number;
  codLivre: number;
  codRetours: number;
  verse: number;
}

export interface PerfBucket {
  date: string; // YYYY-MM-DD (bucket start, local)
  orders: number;
  delivered: number;
  returned: number;
  codCree: number;
  codLivre: number;
  verse: number;
}

export interface PerformanceReport {
  totals: PerfTotals;
  previous: PerfTotals;
  buckets: PerfBucket[];
  granularity: ReportGranularity;
}

const PROBLEM = PARCEL_PROBLEM;

/** Aggregate totals for a single window (org-scoped). */
async function totalsFor(orgId: string, range: DateRange): Promise<PerfTotals> {
  const odb = getOrgDb(orgId);
  const { from, to } = range;

  const codSum = async (statuses: ParcelStatus[], field: "createdAt" | "updatedAt") => {
    const r = await odb.parcel.aggregate({
      _sum: { codPrice: true },
      where: { status: { in: statuses }, [field]: { gte: from, lte: to } },
    });
    return Number(r._sum.codPrice ?? 0);
  };
  const parcelCount = async (statuses: ParcelStatus[]) =>
    odb.parcel.count({
      where: { status: { in: statuses }, updatedAt: { gte: from, lte: to } },
    });

  const [orders, delivered, returned, codCree, codLivre, codRetours, verseAgg] =
    await Promise.all([
      odb.order.count({ where: { createdAt: { gte: from, lte: to } } }),
      parcelCount(PARCEL_DELIVERED),
      parcelCount(PROBLEM),
      codSum(PARCEL_ALL, "createdAt"),
      codSum([ParcelStatus.LIVRE], "updatedAt"),
      codSum(PROBLEM, "updatedAt"),
      odb.remittance.aggregate({
        _sum: { amount: true },
        where: { date: { gte: from, lte: to } },
      }),
    ]);

  const resolved = delivered + returned;
  const codDenom = codLivre + codRetours;
  return {
    orders,
    delivered,
    returned,
    deliveryRate: resolved > 0 ? Math.round((delivered / resolved) * 100) : 0,
    returnRate: codDenom > 0 ? Math.round((codRetours / codDenom) * 100) : 0,
    codCree,
    codLivre,
    codRetours,
    verse: Number(verseAgg._sum.amount ?? 0),
  };
}

interface RawBucketRow {
  bucket: string;
  orders: number;
  delivered: number;
  returned: number;
  cod_cree: number;
  cod_livre: number;
  verse: number;
}

/** One grouped query per source, merged by bucket. */
async function bucketsFor(
  orgId: string,
  period: ReportPeriod,
  tz: string
): Promise<PerfBucket[]> {
  const { from, to, granularity } = period;
  // $3 = granularity ('day'|'week'|'month'), $4 = IANA tz — both parameterized.
  const rows = await withOrg(orgId, (tx) =>
    tx.$queryRawUnsafe<RawBucketRow[]>(
      `
      WITH ord AS (
        SELECT to_char(date_trunc($3, "createdAt" AT TIME ZONE $4), 'YYYY-MM-DD') AS bucket, count(*)::int AS orders
        FROM "Order" WHERE "createdAt" >= $1 AND "createdAt" <= $2 GROUP BY 1
      ),
      cre AS (
        SELECT to_char(date_trunc($3, "createdAt" AT TIME ZONE $4), 'YYYY-MM-DD') AS bucket, COALESCE(sum("codPrice"),0)::float8 AS cod_cree
        FROM "Parcel" WHERE "createdAt" >= $1 AND "createdAt" <= $2 GROUP BY 1
      ),
      par AS (
        SELECT to_char(date_trunc($3, "updatedAt" AT TIME ZONE $4), 'YYYY-MM-DD') AS bucket,
               count(*) FILTER (WHERE status = 'LIVRE')::int AS delivered,
               count(*) FILTER (WHERE status IN ('RETOURNE','REFUSE'))::int AS returned,
               COALESCE(sum("codPrice") FILTER (WHERE status = 'LIVRE'),0)::float8 AS cod_livre
        FROM "Parcel"
        WHERE "updatedAt" >= $1 AND "updatedAt" <= $2
          AND status IN ('LIVRE','RETOURNE','REFUSE')
        GROUP BY 1
      ),
      rem AS (
        SELECT to_char(date_trunc($3, "date" AT TIME ZONE $4), 'YYYY-MM-DD') AS bucket, COALESCE(sum(amount),0)::float8 AS verse
        FROM "Remittance" WHERE "date" >= $1 AND "date" <= $2 GROUP BY 1
      )
      SELECT b.bucket,
             COALESCE(ord.orders,0)::int      AS orders,
             COALESCE(par.delivered,0)::int   AS delivered,
             COALESCE(par.returned,0)::int    AS returned,
             COALESCE(cre.cod_cree,0)::float8 AS cod_cree,
             COALESCE(par.cod_livre,0)::float8 AS cod_livre,
             COALESCE(rem.verse,0)::float8    AS verse
      FROM (
        SELECT bucket FROM ord
        UNION SELECT bucket FROM cre
        UNION SELECT bucket FROM par
        UNION SELECT bucket FROM rem
      ) b
      LEFT JOIN ord ON ord.bucket = b.bucket
      LEFT JOIN cre ON cre.bucket = b.bucket
      LEFT JOIN par ON par.bucket = b.bucket
      LEFT JOIN rem ON rem.bucket = b.bucket
      `,
      from,
      to,
      granularity,
      tz
    )
  );

  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  const toRow = (date: string): PerfBucket => {
    const r = byBucket.get(date);
    return {
      date,
      orders: Number(r?.orders ?? 0),
      delivered: Number(r?.delivered ?? 0),
      returned: Number(r?.returned ?? 0),
      codCree: Number(r?.cod_cree ?? 0),
      codLivre: Number(r?.cod_livre ?? 0),
      verse: Number(r?.verse ?? 0),
    };
  };

  // Daily: zero-fill every local day so the chart has no gaps. Week/month:
  // return the (sorted) buckets the DB produced.
  if (granularity === "day") {
    const out: PerfBucket[] = [];
    const end = to.getTime();
    for (let i = 0, cur = from.getTime(); cur <= end && i < 400; i++, cur += 86_400_000) {
      out.push(toRow(dayInTz(tz, 0, new Date(cur))));
    }
    return out;
  }
  return [...byBucket.keys()].sort().map(toRow);
}

export async function getPerformanceReport(
  orgId: string,
  period: ReportPeriod
): Promise<PerformanceReport> {
  const { timezone } = await getOrgSettings(orgId);
  const [totals, previous, buckets] = await Promise.all([
    totalsFor(orgId, period),
    totalsFor(orgId, period.previous),
    bucketsFor(orgId, period, timezone),
  ]);
  return { totals, previous, buckets, granularity: period.granularity };
}
