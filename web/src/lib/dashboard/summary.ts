import "server-only";

import {
  OrderStatus,
  ParcelStatus,
  Prisma,
} from "@/generated/prisma/client";
import { db, getOrgDb, withOrg } from "@/lib/db";
import { LOW_STOCK_THRESHOLD } from "@/lib/integrations/shopify/inventory";
import type { AppRole } from "@/lib/auth/roles";
import { meetsOrgRole } from "@/lib/auth/roles";
import { getOrgSettings } from "@/lib/org/settings";
import { dayInTz, localMidnightUTC } from "@/lib/time";
import { PARCEL_IN_TRANSIT, PARCEL_PROBLEM } from "@/lib/parcel-status";
import type { DashboardSummary } from "./types";

/** Humanize an AuditLog action into a short French phrase. */
function humanize(action: string, meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  const n = (m.count ?? m.updated ?? (Array.isArray(m.ids) ? m.ids.length : undefined)) as
    | number
    | undefined;
  switch (action) {
    case "bulk.confirm":
      return `a confirmé ${n ?? ""} commande(s)`.replace("  ", " ").trim();
    case "bulk.cancel":
      return `a annulé ${n ?? ""} commande(s)`.replace("  ", " ").trim();
    case "order.remake":
      return "a remanié une commande";
    case "shipping.parcel_created":
      return "a créé un colis OzonExpress";
    case "shipping.bl_created":
      return `a créé un bon de livraison (${m.parcelCount ?? 0} colis)`;
    case "shipping.alias_learned":
      return "a corrigé une ville";
    case "shipping.cities_refreshed":
      return `a actualisé le catalogue des villes (${m.count ?? 0})`;
    case "stock.rupture":
      return `a marqué ${n ?? ""} article(s) en rupture`.replace("  ", " ").trim();
    case "stock.restock":
      return `a réapprovisionné ${n ?? ""} article(s)`.replace("  ", " ").trim();
    case "catalog.synced":
      return "a synchronisé le catalogue Shopify";
    case "catalog.imported_csv":
      return `a importé le catalogue (${m.variants ?? 0} variantes)`;
    case "integration.connected":
      return "a connecté une intégration";
    case "integration.disconnected":
      return "a déconnecté une intégration";
    default:
      if (action.startsWith("order.status."))
        return `a changé le statut d'une commande`;
      return action;
  }
}

/**
 * Build the dashboard summary for an org. Cheap aggregates only (count /
 * aggregate / one grouped raw query for the trend); the activity feed is the
 * only query returning rows. The `finance` block is included ONLY for
 * owner/admin — never sent to operators/viewers.
 */
export async function getDashboardSummary(
  orgId: string,
  role: AppRole | null
): Promise<DashboardSummary> {
  const odb = getOrgDb(orgId);
  const { timezone } = await getOrgSettings(orgId);
  const today = localMidnightUTC(timezone);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const canSeeFinance = meetsOrgRole(role, "admin");

  const [
    aConfirmer,
    pretes,
    nouvellesToday,
    enTransit,
    livreWeek,
    problemes,
    oos,
    low,
    customersTotal,
    nouveauxWeek,
    citiesUnresolved,
    logs,
    trendRows,
  ] = await Promise.all([
    odb.order.count({ where: { status: OrderStatus.NOUVELLE } }),
    odb.order.count({
      where: { status: OrderStatus.CONFIRMEE, parcel: { is: null } },
    }),
    odb.order.count({ where: { createdAt: { gte: today } } }),
    odb.parcel.count({ where: { status: { in: PARCEL_IN_TRANSIT } } }),
    odb.parcel.count({
      where: { status: ParcelStatus.LIVRE, updatedAt: { gte: weekAgo } },
    }),
    odb.parcel.count({ where: { status: { in: PARCEL_PROBLEM } } }),
    odb.variant.count({ where: { inventoryQty: { lte: 0 } } }),
    odb.variant.count({
      where: { inventoryQty: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
    }),
    odb.customer.count(),
    odb.customer.count({ where: { createdAt: { gte: weekAgo } } }),
    odb.order.count({
      where: {
        status: OrderStatus.CONFIRMEE,
        parcel: { is: null },
        cityId: null,
      },
    }),
    odb.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, actorUserId: true, action: true, meta: true, createdAt: true },
    }),
    withOrg(orgId, (tx) =>
      tx.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE ${timezone}), 'YYYY-MM-DD') AS day,
               count(*)::int AS n
        FROM "Order"
        WHERE "createdAt" >= now() - interval '14 days'
        GROUP BY 1`
    ),
  ]);

  // Activity actor names (User is a global table — base client).
  const userIds = [
    ...new Set(logs.map((l) => l.actorUserId).filter((x): x is string => !!x)),
  ];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameById = new Map(
    users.map((u) => [u.id, u.name || u.email || "Utilisateur"])
  );
  const activity = logs.map((l) => ({
    id: l.id,
    actorName: l.actorUserId
      ? nameById.get(l.actorUserId) ?? "Utilisateur"
      : "Système",
    action: humanize(l.action, l.meta),
    createdAt: l.createdAt.toISOString(),
  }));

  // Trend — fill 14 buckets oldest -> newest.
  const byDay = new Map(trendRows.map((r) => [r.day, Number(r.n)]));
  const trend: DashboardSummary["trend"] = [];
  for (let i = 13; i >= 0; i--) {
    const d = dayInTz(timezone, i);
    trend.push({ date: d, orders: byDay.get(d) ?? 0 });
  }

  // Needs-attention queue (non-zero only), each deep-linking into the tool.
  const attention: DashboardSummary["attention"] = [];
  if (aConfirmer > 0)
    attention.push({
      kind: "orders_a_confirmer",
      count: aConfirmer,
      href: "/orders?status=NOUVELLE",
    });
  if (problemes > 0)
    attention.push({ kind: "parcels_probleme", count: problemes, href: "/shipping" });
  if (oos > 0)
    attention.push({
      kind: "stock_oos",
      count: oos,
      href: "/stock?stockState=RUPTURE",
    });
  if (citiesUnresolved > 0)
    attention.push({
      kind: "cities_unresolved",
      count: citiesUnresolved,
      href: "/shipping",
    });

  const summary: DashboardSummary = {
    orders: { aConfirmer, pretes, nouvellesToday },
    parcels: { enTransit, livreWeek, problemes },
    stock: { oos, low },
    customers: { total: customersTotal, nouveauxWeek },
    attention,
    activity,
    trend,
  };

  if (canSeeFinance) {
    const sum = async (statuses: ParcelStatus[]) => {
      const r = await odb.parcel.aggregate({
        _sum: { codPrice: true },
        where: { status: { in: statuses } },
      });
      return Number(r._sum.codPrice ?? new Prisma.Decimal(0));
    };
    const [livreAEncaisser, enCours, retours] = await Promise.all([
      sum([ParcelStatus.LIVRE]),
      sum(PARCEL_IN_TRANSIT),
      sum(PARCEL_PROBLEM),
    ]);
    summary.finance = { livreAEncaisser, enCours, retours };
  }

  return summary;
}
