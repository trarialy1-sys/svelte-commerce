import { OrderStatus } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db, getOrgDb } from "@/lib/db";
import { getCityResolver } from "@/lib/shipping/resolve";
import { ShippingView, type ShippingRow } from "./shipping-view";

export const dynamic = "force-dynamic";

export default async function ShippingPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) {
    return <ShippingView rows={[]} cities={[]} role={appRole} cityCount={0} />;
  }

  const [resolver, cityCount, orders] = await Promise.all([
    getCityResolver(orgId),
    db.cityCatalog.count(),
    getOrgDb(orgId).order.findMany({
      where: { status: OrderStatus.CONFIRMEE, parcel: { is: null } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const rows: ShippingRow[] = orders.map((o) => {
    const ville = o.cityRaw ?? "";
    const address = o.address ?? "";
    let suggestedId: number | null = o.cityId ?? null;
    let method: string = o.cityId != null ? "saved" : "none";
    if (suggestedId == null) {
      const r = resolver.resolve(ville, address);
      suggestedId = r.cityId ?? resolver.suggest(ville, address);
      method = suggestedId == null ? "none" : r.method;
    }
    return {
      id: o.id,
      code: o.code,
      customer: o.customer?.name ?? "—",
      phone: o.phone ?? "",
      cityRaw: ville,
      address,
      total: Number(o.totalPrice),
      savedCityId: o.cityId ?? null,
      suggestedId,
      suggestedName: resolver.cityName(suggestedId),
      method,
    };
  });

  return (
    <ShippingView
      rows={rows}
      cities={resolver.cities}
      role={appRole}
      cityCount={cityCount}
    />
  );
}
