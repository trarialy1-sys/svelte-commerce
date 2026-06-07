import "server-only";

import { getOrgDb } from "@/lib/db";
import { displayPhoneMA } from "@/lib/format";

export type SearchType = "order" | "customer" | "product" | "bl";

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface SearchGroup {
  type: SearchType;
  label: string;
  results: SearchResult[];
  total: number;
}

const GROUP_LABELS: Record<SearchType, string> = {
  order: "Commandes",
  customer: "Clients",
  product: "Produits",
  bl: "Bons de livraison",
};

/** rank: 0 exact · 1 prefix · 2 contains · 3 none — best across the fields. */
export function rank(q: string, fields: Array<string | null | undefined>): number {
  const ql = q.toLowerCase();
  let best = 3;
  for (const f of fields) {
    if (!f) continue;
    const fl = f.toLowerCase();
    if (fl === ql) return 0;
    if (fl.startsWith(ql)) best = Math.min(best, 1);
    else if (fl.includes(ql)) best = Math.min(best, 2);
  }
  return best;
}

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

/**
 * Cross-entity search, org-scoped via getOrgDb. Parallel per-entity ILIKE
 * queries, ranked (exact → prefix → contains), capped per group with a total.
 *
 * NOTE (scale): ILIKE `%q%` is plenty for a few tenants. When rows grow or you
 * want typo tolerance, upgrade these columns to pg_trgm + GIN indexes and rank
 * by similarity — not built now.
 */
export async function searchEntities(
  orgId: string,
  q: string,
  opts: { limit?: number; types?: SearchType[] } = {}
): Promise<SearchGroup[]> {
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);
  const want = (t: SearchType) => !opts.types || opts.types.includes(t);
  const odb = getOrgDb(orgId);
  const fetch = limit * 3; // over-fetch a little, then rank + slice

  const tasks: Array<Promise<SearchGroup | null>> = [];

  // ── Orders (ref / customer name+phone / tracking / sku) ────────────────────
  if (want("order")) {
    const where = {
      OR: [
        { code: contains(q) },
        { phone: contains(q) },
        { customer: { is: { OR: [{ name: contains(q) }, { phone: contains(q) }] } } },
        { parcel: { is: { tracking: contains(q) } } },
        { items: { some: { sku: contains(q) } } },
      ],
    };
    tasks.push(
      Promise.all([
        odb.order.findMany({
          where,
          take: fetch,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            code: true,
            status: true,
            phone: true,
            customer: { select: { name: true, phone: true } },
            parcel: { select: { status: true, tracking: true } },
          },
        }),
        odb.order.count({ where }),
      ]).then(([rows, total]) => {
        const results = rows
          .map((o) => ({
            r: rank(q, [o.code, o.customer?.name, o.customer?.phone, o.phone, o.parcel?.tracking]),
            res: {
              type: "order" as const,
              id: o.id,
              title: `Commande ${o.code}`,
              subtitle: [
                o.customer?.name,
                displayPhoneMA(o.phone ?? o.customer?.phone),
                (o.parcel?.status ?? o.status).toLowerCase(),
              ]
                .filter(Boolean)
                .join(" · "),
              href: `/orders?q=${encodeURIComponent(o.code)}`,
            },
          }))
          .sort((a, b) => a.r - b.r)
          .slice(0, limit)
          .map((x) => x.res);
        return { type: "order" as const, label: GROUP_LABELS.order, results, total };
      })
    );
  }

  // ── Customers (name / phone / city / tags) ─────────────────────────────────
  if (want("customer")) {
    const where = {
      OR: [
        { name: contains(q) },
        { phone: contains(q) },
        { city: contains(q) },
        { tags: { has: q.toLowerCase() } },
      ],
    };
    tasks.push(
      Promise.all([
        odb.customer.findMany({
          where,
          take: fetch,
          orderBy: { lastOrderAt: "desc" },
          select: { id: true, name: true, phone: true, city: true },
        }),
        odb.customer.count({ where }),
      ]).then(([rows, total]) => {
        const results = rows
          .map((c) => ({
            r: rank(q, [c.name, c.phone, c.city]),
            res: {
              type: "customer" as const,
              id: c.id,
              title: c.name,
              subtitle: [displayPhoneMA(c.phone), c.city].filter(Boolean).join(" · "),
              href: `/customers/${c.id}`,
            },
          }))
          .sort((a, b) => a.r - b.r)
          .slice(0, limit)
          .map((x) => x.res);
        return { type: "customer" as const, label: GROUP_LABELS.customer, results, total };
      })
    );
  }

  // ── Products / Variants (product title / sku) ──────────────────────────────
  if (want("product")) {
    const where = { OR: [{ sku: contains(q) }, { title: contains(q) }] };
    tasks.push(
      Promise.all([
        odb.variant.findMany({
          where,
          take: fetch,
          orderBy: { title: "asc" },
          select: { id: true, sku: true, title: true, inventoryQty: true },
        }),
        odb.variant.count({ where }),
      ]).then(([rows, total]) => {
        const results = rows
          .map((v) => ({
            r: rank(q, [v.sku, v.title]),
            res: {
              type: "product" as const,
              id: v.id,
              title: v.title || v.sku,
              subtitle: `${v.sku} · stock ${v.inventoryQty}`,
              href: `/products?q=${encodeURIComponent(v.sku)}`,
            },
          }))
          .sort((a, b) => a.r - b.r)
          .slice(0, limit)
          .map((x) => x.res);
        return { type: "product" as const, label: GROUP_LABELS.product, results, total };
      })
    );
  }

  // ── Bons de livraison (ref) ────────────────────────────────────────────────
  if (want("bl")) {
    const where = { ref: contains(q) };
    tasks.push(
      Promise.all([
        odb.deliveryNote.findMany({
          where,
          take: fetch,
          orderBy: { createdAt: "desc" },
          select: { id: true, ref: true, parcelCount: true, createdAt: true },
        }),
        odb.deliveryNote.count({ where }),
      ]).then(([rows, total]) => {
        const results = rows
          .map((d) => ({
            r: rank(q, [d.ref]),
            res: {
              type: "bl" as const,
              id: d.id,
              title: `BL ${d.ref}`,
              subtitle: `${d.parcelCount} colis`,
              href: `/shipping`,
            },
          }))
          .sort((a, b) => a.r - b.r)
          .slice(0, limit)
          .map((x) => x.res);
        return { type: "bl" as const, label: GROUP_LABELS.bl, results, total };
      })
    );
  }

  const groups = (await Promise.all(tasks)).filter(
    (g): g is SearchGroup => g != null && g.results.length > 0
  );
  return groups;
}
