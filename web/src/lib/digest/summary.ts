import "server-only";

import { OrderStatus, ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import { PARCEL_PROBLEM } from "@/lib/parcel-status";
import { countReorderNeeded } from "@/lib/stock/velocity";
import { startOfLocalDayUTC } from "@/lib/time";

export interface DigestSummary {
  date: string; // previous calendar day, YYYY-MM-DD (org tz)
  org: {
    name: string;
    logoUrl: string | null;
    brandColor: string;
    currency: string;
    locale: string;
  };
  pulse: {
    newOrders: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    returns: number;
  };
  attention: { aConfirmer: number; problemes: number; oos: number; aReappro: number };
  cod: { livreAEncaisser: number; enAttente: number };
  isEmpty: boolean;
}

/** Previous-day per-org summary (org timezone). Reuses the dashboard's COD logic. */
export async function buildDigest(orgId: string): Promise<DigestSummary> {
  const odb = getOrgDb(orgId);
  const settings = await getOrgSettings(orgId);
  const tz = settings.timezone;

  const from = startOfLocalDayUTC(tz, 1); // yesterday 00:00 local
  const to = startOfLocalDayUTC(tz, 0); // today 00:00 local
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);

  const win = { gte: from, lt: to };

  const [
    newOrders,
    confirmed,
    shipped,
    delivered,
    returns,
    aConfirmer,
    problemes,
    oos,
    aReappro,
    livreAgg,
    verseAgg,
  ] = await Promise.all([
    odb.order.count({ where: { createdAt: win } }),
    odb.order.count({ where: { confirmedAt: win } }),
    odb.parcel.count({ where: { createdAt: win } }),
    odb.parcel.count({ where: { status: ParcelStatus.LIVRE, updatedAt: win } }),
    odb.parcel.count({ where: { status: { in: PARCEL_PROBLEM }, updatedAt: win } }),
    odb.order.count({ where: { status: OrderStatus.NOUVELLE } }),
    odb.parcel.count({ where: { status: { in: PARCEL_PROBLEM } } }),
    odb.variant.count({ where: { OR: [{ inventoryQty: { lte: 0 } }, { manualOOS: true }] } }),
    countReorderNeeded(orgId),
    odb.parcel.aggregate({
      _sum: { codPrice: true },
      where: { status: ParcelStatus.LIVRE },
    }),
    odb.remittance.aggregate({ _sum: { amount: true } }),
  ]);

  const livreAEncaisser = Number(livreAgg._sum.codPrice ?? 0);
  const verse = Number(verseAgg._sum.amount ?? 0);

  const pulse = { newOrders, confirmed, shipped, delivered, returns };
  const attention = { aConfirmer, problemes, oos, aReappro };
  const isEmpty =
    newOrders + confirmed + shipped + delivered + returns === 0 &&
    aConfirmer + problemes + oos + aReappro === 0;

  return {
    date,
    org: {
      name: settings.name,
      logoUrl: settings.logoUrl,
      brandColor: settings.brandColor,
      currency: settings.currency,
      locale: settings.locale,
    },
    pulse,
    attention,
    cod: { livreAEncaisser, enAttente: livreAEncaisser - verse },
    isEmpty,
  };
}
