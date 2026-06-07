import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb, withOrg } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import {
  PARCEL_ALL,
  PARCEL_IN_TRANSIT,
  PARCEL_PROBLEM,
} from "@/lib/parcel-status";
import { dayInTz } from "@/lib/time";
import type { Period } from "./period";

export interface FinanceSummary {
  overview: {
    enCours: number;
    livre: number;
    verse: number;
    enAttente: number;
    retours: number;
  };
  summary: {
    commandes: number;
    codCree: number;
    codLivre: number;
    codRetourne: number;
    tauxRetour: number; // money-weighted %, 0–100
    fees?: { fraisEstimes: number; netEstime: number };
  };
  trend: Array<{ date: string; cod: number }>;
}

function num(d: { _sum: { codPrice: bigint | null | { toString(): string } } }): number {
  return Number(d._sum.codPrice ?? 0);
}

export async function getFinanceSummary(
  orgId: string,
  period: Period
): Promise<FinanceSummary> {
  const odb = getOrgDb(orgId);
  const { from, to } = period;
  const { timezone } = await getOrgSettings(orgId);

  const sumCod = async (statuses: ParcelStatus[], field: "createdAt" | "updatedAt") => {
    const r = await odb.parcel.aggregate({
      _sum: { codPrice: true },
      where: { status: { in: statuses }, [field]: { gte: from, lte: to } },
    });
    return num(r);
  };
  const countParcels = async (statuses: ParcelStatus[]) =>
    odb.parcel.count({
      where: { status: { in: statuses }, updatedAt: { gte: from, lte: to } },
    });

  const [
    enCours,
    livre,
    retours,
    codCree,
    commandes,
    deliveredCount,
    returnedCount,
    verseAgg,
    settings,
    trendRows,
  ] = await Promise.all([
    sumCod(PARCEL_IN_TRANSIT, "updatedAt"),
    sumCod([ParcelStatus.LIVRE], "updatedAt"),
    sumCod(PARCEL_PROBLEM, "updatedAt"),
    sumCod(PARCEL_ALL, "createdAt"),
    odb.order.count({ where: { createdAt: { gte: from, lte: to } } }),
    countParcels([ParcelStatus.LIVRE]),
    countParcels(PARCEL_PROBLEM),
    odb.remittance.aggregate({
      _sum: { amount: true },
      where: { date: { gte: from, lte: to } },
    }),
    odb.financeSettings.findUnique({ where: { orgId } }),
    withOrg(orgId, (tx) =>
      tx.$queryRaw<{ bucket: string; cod: number }[]>`
        SELECT to_char(date_trunc(${period.granularity}, "updatedAt" AT TIME ZONE ${timezone}), 'YYYY-MM-DD') AS bucket,
               COALESCE(sum("codPrice"), 0)::float8 AS cod
        FROM "Parcel"
        WHERE status = 'LIVRE' AND "updatedAt" >= ${from} AND "updatedAt" <= ${to}
        GROUP BY 1`
    ),
  ]);

  const verse = Number(verseAgg._sum.amount ?? 0);
  const denom = livre + retours;
  const tauxRetour = denom > 0 ? Math.round((retours / denom) * 100) : 0;

  // Estimated net — only when at least one fee field is set.
  const ship = settings?.shippingFeePerParcel;
  const comm = settings?.codCommissionPct;
  const retFee = settings?.returnFee;
  const feesSet = ship != null || comm != null || retFee != null;
  let fees: FinanceSummary["summary"]["fees"];
  if (feesSet) {
    const fraisEstimes =
      Number(ship ?? 0) * deliveredCount +
      (Number(comm ?? 0) / 100) * livre +
      Number(retFee ?? 0) * returnedCount;
    fees = { fraisEstimes, netEstime: livre - fraisEstimes };
  }

  return {
    overview: { enCours, livre, verse, enAttente: livre - verse, retours },
    summary: {
      commandes,
      codCree,
      codLivre: livre,
      codRetourne: retours,
      tauxRetour,
      fees,
    },
    trend: fillBuckets(period, trendRows, timezone),
  };
}

/** Fill the trend across the period (oldest → newest). */
function fillBuckets(
  period: Period,
  rows: { bucket: string; cod: number }[],
  tz: string
): Array<{ date: string; cod: number }> {
  const byBucket = new Map(rows.map((r) => [r.bucket, Number(r.cod)]));

  // Long ranges: the DB already truncated + summed by week — return those
  // rows directly (sorted), no zero-fill.
  if (period.granularity === "week") {
    return [...byBucket.entries()]
      .map(([date, cod]) => ({ date, cod }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Daily: emit a zero-filled point for every local day in the range.
  const out: Array<{ date: string; cod: number }> = [];
  const end = period.to.getTime();
  for (let i = 0, cur = period.from.getTime(); cur <= end && i < 400; i++, cur += 86_400_000) {
    const key = dayInTz(tz, 0, new Date(cur));
    out.push({ date: key, cod: byBucket.get(key) ?? 0 });
  }
  return out;
}
