import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { RETURN_CHECK } from "@/lib/shipping/returns";
import { ReturnsView, type ReturnRow } from "./returns-view";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) return <ReturnsView rows={[]} done={[]} role={appRole} />;

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

  return <ReturnsView rows={pending.map(toRow)} done={recent.map(toRow)} role={appRole} />;
}
