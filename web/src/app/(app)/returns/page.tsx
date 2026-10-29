import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { autoRestockEnabled, RETURN_CHECK } from "@/lib/shipping/returns";
import { ReturnsView, type ReturnRow } from "./returns-view";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) return <ReturnsView rows={[]} done={[]} role={appRole} auto={autoRestockEnabled()} />;

  const odb = getOrgDb(orgId);
  const select = {
    id: true,
    tracking: true,
    ozonEventAt: true,
    returnReceivedAt: true,
    returnCheck: true,
    returnCheckAt: true,
    returnCheckNote: true,
    order: {
      select: {
        code: true,
        cityRaw: true,
        customer: { select: { name: true } },
        items: { select: { sku: true, title: true, qty: true }, orderBy: { id: "asc" as const } },
      },
    },
  };
  const [pending, recent] = await Promise.all([
    odb.parcel.findMany({
      where: { returnCheck: RETURN_CHECK.PENDING },
      select,
      orderBy: { returnReceivedAt: "asc" },
      take: 300,
    }),
    odb.parcel.findMany({
      where: { returnCheck: { in: [RETURN_CHECK.OK, RETURN_CHECK.CORRECTED] } },
      select,
      orderBy: { returnCheckAt: "desc" },
      take: 30,
    }),
  ]);

  // Product name + photo per SKU for the warehouse to compare with the parcel.
  const skus = [...new Set([...pending, ...recent].flatMap((p) => p.order.items.map((i) => i.sku)))];
  const variants = skus.length
    ? await odb.variant.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, title: true, product: { select: { title: true, imageUrl: true } } },
      })
    : [];
  const info = new Map(variants.map((v) => [v.sku, v]));

  const toRow = (p: (typeof pending)[number]): ReturnRow => ({
    id: p.id,
    tracking: p.tracking ?? "",
    order: p.order.code,
    customer: p.order.customer?.name ?? "—",
    city: p.order.cityRaw ?? "",
    returnedAt: (p.returnReceivedAt ?? new Date()).toISOString(),
    ozonEventAt: p.ozonEventAt,
    check: p.returnCheck,
    checkNote: p.returnCheckNote,
    items: p.order.items.map((i) => {
      const v = info.get(i.sku);
      return {
        sku: i.sku,
        qty: i.qty,
        name: v?.product?.title ?? i.title ?? i.sku,
        variant: v?.title ?? "",
        image: v?.product?.imageUrl ?? null,
      };
    }),
  });

  // While auto-restock is off (the Google Sheet still does it), list the
  // returns Ozon handed back recently, read-only.
  const received = autoRestockEnabled()
    ? []
    : await odb.parcel.findMany({
        where: { returnReceivedAt: { not: null }, returnCheck: null },
        select,
        orderBy: { returnReceivedAt: "desc" },
        take: 50,
      });
  const info2 = received.length
    ? await odb.variant.findMany({
        where: { sku: { in: [...new Set(received.flatMap((p) => p.order.items.map((i) => i.sku)))] } },
        select: { sku: true, title: true, product: { select: { title: true, imageUrl: true } } },
      })
    : [];
  for (const v of info2) if (!info.has(v.sku)) info.set(v.sku, v);

  return (
    <ReturnsView
      rows={pending.map(toRow)}
      done={recent.map(toRow)}
      received={received.map(toRow)}
      role={appRole}
      auto={autoRestockEnabled()}
    />
  );
}
