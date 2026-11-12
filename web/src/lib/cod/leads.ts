import "server-only";

import { getOrgDb } from "@/lib/db";

import { COD_ACTION } from "./form";

export interface AbandonedForm {
  leadId: string;
  at: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  handle: string;
  quantity: number;
  utmSource: string | null;
}

/**
 * Forms where the visitor typed a phone number but did not order
 * (Releasit keeps these as draft orders; we list them for call-backs).
 */
export async function abandonedForms(orgId: string, days = 7): Promise<AbandonedForm[]> {
  const odb = getOrgDb(orgId);
  const since = new Date(Date.now() - days * 86_400_000);
  const [leads, orders] = await Promise.all([
    odb.auditLog.findMany({
      where: { action: COD_ACTION.LEAD, createdAt: { gt: since } },
      select: { entityId: true, createdAt: true, meta: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    odb.auditLog.findMany({
      where: { action: COD_ACTION.ORDER, createdAt: { gt: since } },
      select: { entityId: true, meta: true },
    }),
  ]);
  const orderedLeads = new Set(orders.map((o) => (o.meta as { leadId?: string } | null)?.leadId));
  const orderedPhones = new Set(orders.map((o) => o.entityId));
  const seen = new Set<string>();
  const out: AbandonedForm[] = [];
  for (const l of leads) {
    const id = l.entityId ?? "";
    const m = (l.meta ?? {}) as {
      name?: string;
      phone?: string;
      city?: string;
      address?: string;
      handle?: string;
      items?: { quantity?: number }[];
      utm?: Record<string, string>;
    };
    const phone = m.phone ?? "";
    // Newest entry per form; skip forms that became an order, or a phone that ordered since.
    if (!id || seen.has(id) || orderedLeads.has(id) || orderedPhones.has(phone)) {
      seen.add(id);
      continue;
    }
    seen.add(id);
    const clean = (v?: string) => (v && !/^-+$/.test(v) ? v : "");
    out.push({
      leadId: id,
      at: l.createdAt.toISOString(),
      name: clean(m.name),
      phone,
      city: clean(m.city),
      address: clean(m.address),
      handle: m.handle ?? "",
      quantity: (m.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0),
      utmSource: m.utm?.utm_source ?? null,
    });
  }
  return out;
}
