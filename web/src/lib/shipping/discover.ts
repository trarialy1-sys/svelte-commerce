import "server-only";

import { ParcelStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getOzonClient, type OzonClient } from "./ozon";
import { isReturnReceived, mapOzonStatus } from "./ozon-status-map";
import type { OzonTracking } from "./ozon-tracking";
import { fetchOzonTracking } from "./status-sync";
import { candidateCodes } from "./ozon-codes";

/**
 * Discover parcels shipped OUTSIDE Partner OS (e.g. the Google Sheet export →
 * Ozon Excel import) and attach them to their orders, so tracking, returns and
 * the P&L see every parcel.
 *
 * The sheet builds the code d'envoi as
 *   {SKUs collés}_{3 premières lettres de la ville, en majuscules}{4 derniers chiffres du tél}
 * and orders split into one parcel per item use `{SKU}_{…}` for each. We
 * rebuild those candidates from the order, ask Ozon, and keep the first code
 * Ozon knows that was created on/after the order (a repeat customer can have an
 * older parcel with the very same code).
 */

export interface DiscoverResult {
  configured: boolean;
  checked: number;
  found: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function discoverParcels(
  orgId: string,
  opts: {
    days?: number;
    limit?: number;
    fetcher?: (client: OzonClient, code: string) => Promise<OzonTracking | null>;
  } = {}
): Promise<DiscoverResult> {
  const days = opts.days ?? 20;
  const odb = getOrgDb(orgId);

  let client: OzonClient;
  try {
    client = await getOzonClient(orgId);
  } catch {
    return { configured: false, checked: 0, found: 0 };
  }
  const fetcher = opts.fetcher ?? fetchOzonTracking;

  const orders = await odb.order.findMany({
    where: {
      parcel: { is: null },
      createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
    },
    select: {
      id: true,
      code: true,
      cityRaw: true,
      phone: true,
      totalPrice: true,
      createdAt: true,
      items: { select: { sku: true }, orderBy: { id: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 200,
  });

  let checked = 0;
  let found = 0;
  for (const o of orders) {
    const codes = candidateCodes({
      skus: o.items.map((i) => i.sku),
      cityRaw: o.cityRaw,
      phone: o.phone,
    });
    // Ozon creation day must be on/after the day before the order.
    const minDay = new Date(o.createdAt.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);

    for (const code of codes) {
      const taken = await odb.parcel.findFirst({
        where: { tracking: code },
        select: { id: true },
      });
      if (taken) continue;
      checked++;
      let t: OzonTracking | null = null;
      try {
        t = await fetcher(client, code);
      } catch (e) {
        console.error(`[discover] ${code} failed`, e);
      }
      await sleep(150);
      if (!t) continue;
      if (t.createdAt && t.createdAt.slice(0, 10) < minDay) continue;

      const received = isReturnReceived(t.status, t.comment);
      // Keep Ozon's creation time (so "expédiées aujourd'hui" and the 60-day
      // tracking window stay true); Ozon times are Morocco local time.
      const created = t.createdAt
        ? new Date(`${t.createdAt.replace(" ", "T")}:00+01:00`)
        : null;
      await odb.parcel.create({
        data: {
          orgId,
          ...(created && !Number.isNaN(created.getTime()) ? { createdAt: created } : {}),
          orderId: o.id,
          tracking: code,
          codPrice: o.totalPrice,
          status: mapOzonStatus(t.status) ?? ParcelStatus.CREE,
          ozonStatus: t.status,
          ozonComment: t.comment || null,
          ozonEventAt: t.eventAt,
          lastStatusSyncAt: new Date(),
          origin: "DISCOVERED",
          // Already back when first seen: counted by hand before → no restock.
          ...(received ? { returnReceivedAt: new Date() } : {}),
        },
      });
      found++;
      break; // one parcel per order
    }
  }

  if (found > 0) {
    await odb.auditLog.create({
      data: {
        orgId,
        action: "shipping.parcels_discovered",
        entity: "Parcel",
        meta: { orders: orders.length, checked, found },
      },
    });
  }
  return { configured: true, checked, found };
}
