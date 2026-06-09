import { OrderStatus } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { getCityResolver } from "@/lib/shipping/resolve";
import { TodayView, type ReadyOrder } from "./today-view";

export const dynamic = "force-dynamic";

/** City detections confident enough that the one-click ship won't need a fix. */
const CONFIDENT = new Set(["alias", "exact", "casa", "fuzzy"]);

/** Statuses still awaiting a confirmation call. */
const TO_CONFIRM: OrderStatus[] = [
  OrderStatus.NOUVELLE,
  OrderStatus.REPORTEE,
  OrderStatus.PAS_DE_REPONSE,
];

export default async function TodayPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) {
    return <TodayView ready={[]} toConfirmCount={0} shippedToday={0} role={appRole} />;
  }

  const odb = getOrgDb(orgId);
  // Local start of day (counter for "expédiées aujourd'hui").
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [resolver, toConfirmCount, shippedToday, ready] = await Promise.all([
    getCityResolver(orgId),
    odb.order.count({ where: { status: { in: TO_CONFIRM } } }),
    odb.parcel.count({ where: { createdAt: { gte: startOfDay } } }),
    odb.order.findMany({
      where: { status: OrderStatus.CONFIRMEE, parcel: { is: null } },
      include: { customer: { select: { name: true } } },
      orderBy: { confirmedAt: "desc" },
      take: 500,
    }),
  ]);

  const readyRows: ReadyOrder[] = ready.map((o) => ({
    id: o.id,
    code: o.code,
    customer: o.customer?.name ?? "—",
    cityRaw: o.cityRaw ?? "",
    total: Number(o.totalPrice),
    // Group each ready order by its confirmation day (falls back to import day).
    dayAt: (o.confirmedAt ?? o.createdAt).toISOString(),
    // Resolved already, or a confident auto-detection the one-click can use.
    cityOk:
      o.cityId != null ||
      CONFIDENT.has(resolver.closest(o.cityRaw ?? "", o.address ?? "").method),
  }));

  return (
    <TodayView
      ready={readyRows}
      toConfirmCount={toConfirmCount}
      shippedToday={shippedToday}
      role={appRole}
    />
  );
}
