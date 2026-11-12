import "server-only";

import { getOrgDb } from "@/lib/db";

import { COD_ACTION } from "./form";

/** One "form opened" per visitor (IP) and product per 30 minutes. */
export async function logFormOpen(orgId: string, handle: string, ip: string | null, utm: Record<string, unknown>): Promise<void> {
  const odb = getOrgDb(orgId);
  if (ip) {
    const recent = await odb.auditLog.count({
      where: { action: COD_ACTION.OPEN, entityId: handle, ip, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } },
    });
    if (recent > 0) return;
  }
  const source = typeof utm.utm_source === "string" ? utm.utm_source.slice(0, 60) : null;
  await odb.auditLog.create({
    data: { orgId, action: COD_ACTION.OPEN, entity: "CodForm", entityId: handle, ip, meta: { source } as object },
  });
}

export interface FunnelRow {
  key: string;
  opens: number;
  started: number;
  orders: number;
  revenueCents: number;
}

export interface Funnel {
  days: number;
  total: FunnelRow;
  byProduct: FunnelRow[];
  bySource: FunnelRow[];
  upsellOrders: number;
  offerOrders: number;
}

/** Opens → forms started (phone typed) → orders, like Releasit's analytics. */
export async function codFunnel(orgId: string, days = 7): Promise<Funnel> {
  const odb = getOrgDb(orgId);
  const since = new Date(Date.now() - days * 86_400_000);
  const [opens, leads, orders] = await Promise.all([
    odb.auditLog.findMany({ where: { action: COD_ACTION.OPEN, createdAt: { gt: since } }, select: { entityId: true, meta: true }, take: 50_000 }),
    odb.auditLog.findMany({
      where: { action: COD_ACTION.LEAD, createdAt: { gt: since } },
      select: { entityId: true, meta: true },
      distinct: ["entityId"],
      take: 50_000,
    }),
    odb.auditLog.findMany({ where: { action: COD_ACTION.ORDER, createdAt: { gt: since } }, select: { meta: true }, take: 50_000 }),
  ]);
  const rows = new Map<string, FunnelRow>();
  const src = new Map<string, FunnelRow>();
  const get = (m: Map<string, FunnelRow>, k: string) => {
    let r = m.get(k);
    if (!r) m.set(k, (r = { key: k, opens: 0, started: 0, orders: 0, revenueCents: 0 }));
    return r;
  };
  const total: FunnelRow = { key: "total", opens: 0, started: 0, orders: 0, revenueCents: 0 };
  for (const o of opens) {
    const m = (o.meta ?? {}) as { source?: string | null };
    get(rows, o.entityId ?? "?").opens++;
    get(src, m.source || "direct").opens++;
    total.opens++;
  }
  for (const l of leads) {
    const m = (l.meta ?? {}) as { handle?: string; utm?: Record<string, string> };
    get(rows, m.handle || "?").started++;
    get(src, m.utm?.utm_source || "direct").started++;
    total.started++;
  }
  let upsellOrders = 0;
  let offerOrders = 0;
  for (const o of orders) {
    const m = (o.meta ?? {}) as { handle?: string; utm?: Record<string, string>; totalCents?: number; upsells?: string[]; tier?: string | null };
    const cents = m.totalCents ?? 0;
    for (const r of [get(rows, m.handle || "?"), get(src, m.utm?.utm_source || "direct"), total]) {
      r.orders++;
      r.revenueCents += cents;
    }
    if (m.upsells?.length) upsellOrders++;
    if (m.tier) offerOrders++;
  }
  const sort = (m: Map<string, FunnelRow>) => [...m.values()].sort((a, b) => b.orders - a.orders || b.opens - a.opens).slice(0, 20);
  return { days, total, byProduct: sort(rows), bySource: sort(src), upsellOrders, offerOrders };
}
