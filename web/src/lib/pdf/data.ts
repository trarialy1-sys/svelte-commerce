import "server-only";

import { OrderStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import type { OrgBrand, PdfItem } from "./layout";
import type { PackingOrder } from "./packing-slip";
import type { PickingOrder } from "./picking-list";

async function brand(orgId: string): Promise<OrgBrand> {
  const s = await getOrgSettings(orgId);
  return { name: s.name, logoUrl: s.logoUrl, brandColor: s.brandColor };
}

/** Map raw {sku, qty} items to display items, resolving product names by SKU. */
function namer(variants: { sku: string; title: string | null }[]) {
  const bySku = new Map(variants.map((v) => [v.sku, v.title]));
  return (sku: string) => bySku.get(sku) || sku;
}

export async function getPackingData(
  orgId: string,
  orderId: string
): Promise<{ org: OrgBrand; order: PackingOrder } | null> {
  const odb = getOrgDb(orgId);
  const o = await odb.order.findUnique({
    where: { id: orderId },
    select: {
      code: true,
      cityRaw: true,
      address: true,
      phone: true,
      customer: { select: { name: true } },
      items: { select: { sku: true, qty: true } },
      parcel: { select: { tracking: true } },
    },
  });
  if (!o) return null;

  const skus = [...new Set(o.items.map((i) => i.sku))];
  const variants = skus.length
    ? await odb.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true, title: true } })
    : [];
  const name = namer(variants);
  const items: PdfItem[] = o.items.map((i) => ({ sku: i.sku, name: name(i.sku), qty: i.qty }));

  return {
    org: await brand(orgId),
    order: {
      code: o.code,
      customerName: o.customer?.name ?? null,
      phone: o.phone,
      city: o.cityRaw,
      address: o.address,
      tracking: o.parcel?.tracking ?? null,
      items,
    },
  };
}

const BATCH_CAP = 500;

export async function getPickingData(
  orgId: string,
  orderIds?: string[]
): Promise<{ org: OrgBrand; totals: PdfItem[]; orders: PickingOrder[] }> {
  const odb = getOrgDb(orgId);
  // Selected batch, or the whole "Prêtes" queue (CONFIRMEE, not yet shipped).
  const where =
    orderIds && orderIds.length
      ? { id: { in: orderIds } }
      : { status: OrderStatus.CONFIRMEE, parcel: { is: null } };

  const rows = await odb.order.findMany({
    where,
    select: { code: true, items: { select: { sku: true, qty: true } } },
    orderBy: { createdAt: "asc" },
    take: BATCH_CAP,
  });

  const allSkus = [...new Set(rows.flatMap((r) => r.items.map((i) => i.sku)))];
  const variants = allSkus.length
    ? await odb.variant.findMany({ where: { sku: { in: allSkus } }, select: { sku: true, title: true } })
    : [];
  const name = namer(variants);

  const totalMap = new Map<string, PdfItem>();
  const orders: PickingOrder[] = rows.map((r) => {
    const items: PdfItem[] = r.items.map((i) => ({ sku: i.sku, name: name(i.sku), qty: i.qty }));
    for (const it of items) {
      const e = totalMap.get(it.sku);
      if (e) e.qty += it.qty;
      else totalMap.set(it.sku, { ...it });
    }
    return { code: r.code, items };
  });

  const totals = [...totalMap.values()].sort((a, b) => b.qty - a.qty);
  return { org: await brand(orgId), totals, orders };
}
