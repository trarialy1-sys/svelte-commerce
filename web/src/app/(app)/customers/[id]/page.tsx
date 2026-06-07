import { notFound } from "next/navigation";

import { getAuthContext, meetsOrgRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { customerAggregates, returnRate } from "@/lib/customers/aggregates";
import { displayPhoneMA } from "@/lib/format";
import { CustomerDetail } from "./customer-detail";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) notFound();

  const canMoney = meetsOrgRole(appRole, "admin");
  const canEdit = meetsOrgRole(appRole, "operator");
  const odb = getOrgDb(orgId);

  const customer = await odb.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      city: true,
      tags: true,
      isBlocked: true,
      blockedReason: true,
      lastOrderAt: true,
    },
  });
  if (!customer) notFound();

  const [agg, orders, notes, valueAgg] = await Promise.all([
    customerAggregates(orgId, [id]),
    odb.order.findMany({
      where: { customerId: id },
      select: {
        id: true,
        code: true,
        status: true,
        totalPrice: true,
        createdAt: true,
        parcel: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    odb.customerNote.findMany({
      where: { customerId: id },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    odb.order.aggregate({
      where: { customerId: id },
      _sum: { totalPrice: true },
      _count: true,
    }),
  ]);

  const a = agg.get(id) ?? { delivered: 0, returned: 0, codDelivered: 0 };
  const ordersCount = valueAgg._count;
  const avgOrderValue =
    ordersCount > 0 ? Number(valueAgg._sum.totalPrice ?? 0) / ordersCount : 0;

  const kpis = {
    ordersCount,
    delivered: a.delivered,
    returned: a.returned,
    returnRate: Math.round(returnRate(a) * 100),
    lastOrderAt: customer.lastOrderAt ? customer.lastOrderAt.toISOString() : null,
    // Money — owner/admin only.
    ...(canMoney
      ? { codDelivered: a.codDelivered, avgOrderValue }
      : {}),
  };

  return (
    <CustomerDetail
      canEdit={canEdit}
      customer={{
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        phoneDisplay: displayPhoneMA(customer.phone),
        city: customer.city,
        tags: customer.tags,
        isBlocked: customer.isBlocked,
        blockedReason: customer.blockedReason,
      }}
      kpis={kpis}
      orders={orders.map((o) => ({
        id: o.id,
        code: o.code,
        status: o.status,
        parcelStatus: o.parcel?.status ?? null,
        totalPrice: Number(o.totalPrice),
        createdAt: o.createdAt.toISOString(),
      }))}
      notes={notes.map((n) => ({
        id: n.id,
        body: n.body,
        author: n.author?.name || n.author?.email || "Système",
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
