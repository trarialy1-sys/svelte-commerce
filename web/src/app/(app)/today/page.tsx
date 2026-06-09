import { OrderStatus } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { getCityResolver } from "@/lib/shipping/resolve";
import { TodayView, type TodayOrder } from "./today-view";

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
  if (!orgId) return <TodayView orders={[]} role={appRole} />;

  const odb = getOrgDb(orgId);
  // Shipped orders are only kept on the board for a week — older batches live
  // in the full Commandes / Livraisons pages.
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [resolver, toConfirm, ready, shipped] = await Promise.all([
    getCityResolver(orgId),
    odb.order.findMany({
      where: { status: { in: TO_CONFIRM } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    odb.order.findMany({
      where: { status: OrderStatus.CONFIRMEE, parcel: { is: null } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    odb.order.findMany({
      where: { parcel: { isNot: null }, confirmedAt: { gte: since } },
      include: {
        customer: { select: { name: true } },
        parcel: { select: { tracking: true } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 500,
    }),
  ]);

  type OrderWithCustomer = (typeof toConfirm)[number];
  // `dayAt` decides the batch. Confirmed/shipped orders group by their
  // confirmation day; orders still awaiting a call have none, so they fall back
  // to their import day.
  const base = (o: OrderWithCustomer, bucket: TodayOrder["bucket"]) => ({
    id: o.id,
    code: o.code,
    customer: o.customer?.name ?? "—",
    phone: o.phone ?? "",
    cityRaw: o.cityRaw ?? "",
    total: Number(o.totalPrice),
    dayAt: (bucket === "toConfirm" ? o.createdAt : o.confirmedAt ?? o.createdAt).toISOString(),
    bucket,
  });

  const orders: TodayOrder[] = [
    ...toConfirm.map((o) => ({ ...base(o, "toConfirm"), cityOk: true, tracking: null })),
    ...ready.map((o) => ({
      ...base(o, "ready"),
      // Resolved already, or a confident auto-detection the one-click can use.
      cityOk:
        o.cityId != null ||
        CONFIDENT.has(resolver.closest(o.cityRaw ?? "", o.address ?? "").method),
      tracking: null,
    })),
    ...shipped.map((o) => ({
      ...base(o, "shipped"),
      cityOk: true,
      tracking: o.parcel?.tracking ?? null,
    })),
  ];

  return <TodayView orders={orders} role={appRole} />;
}
