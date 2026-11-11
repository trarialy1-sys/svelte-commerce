/**
 * Packs are standalone Shopify products whose variant SKU lists the pieces,
 * joined by " + " (e.g. "hat-02-noir + hat-02-beige"). Shopify does not link
 * their stock to the pieces, so we recompute it: a pack can be sold as many
 * times as its scarcest piece allows.
 *
 * Pure helpers (no DB) — unit-tested.
 */

export function packComponents(sku: string): string[] | null {
  if (!sku.includes(" + ")) return null;
  const parts = sku
    .split(" + ")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

/**
 * Sellable packs = the scarcest piece, counting a piece used twice ("A + A").
 * `null` when a piece is unknown or ambiguous → the pack is left alone.
 * `stock` is looked up with the lower-cased SKU.
 */
export function packAvailable(
  components: string[],
  stock: (skuLower: string) => number | null | undefined
): number | null {
  const need = new Map<string, number>();
  for (const c of components) {
    const k = c.toLowerCase();
    need.set(k, (need.get(k) ?? 0) + 1);
  }
  let min = Number.POSITIVE_INFINITY;
  for (const [k, n] of need) {
    const a = stock(k);
    if (a === null || a === undefined) return null;
    min = Math.min(min, Math.floor(Math.max(0, a) / n));
  }
  return Number.isFinite(min) ? min : null;
}

export interface PackVariant {
  id: string;
  sku: string;
  inventoryQty: number;
  tracked: boolean;
  status: string;
}

export interface PackChange {
  id: string;
  sku: string;
  from: number;
  to: number;
}

/**
 * Decide the new quantity of every pack from the piece quantities.
 * A piece SKU carried by several variants with different quantities is
 * ambiguous (duplicate SKU) → packs using it are reported, not touched.
 */
export function planPackStock(variants: PackVariant[]): {
  packs: number;
  changes: PackChange[];
  unknown: string[];
} {
  const pieces = new Map<string, number | null>();
  for (const v of variants) {
    if (v.status === "deleted" || packComponents(v.sku)) continue;
    const k = v.sku.trim().toLowerCase();
    if (!k) continue;
    // Untracked pieces always sell: they never limit a pack.
    const qty = v.tracked ? v.inventoryQty : Number.MAX_SAFE_INTEGER;
    if (!pieces.has(k)) pieces.set(k, qty);
    else if (pieces.get(k) !== qty) pieces.set(k, null);
  }
  const changes: PackChange[] = [];
  const unknown: string[] = [];
  let packs = 0;
  for (const v of variants) {
    const comps = packComponents(v.sku);
    if (!comps || v.status !== "active" || !v.tracked) continue;
    packs++;
    const target = packAvailable(comps, (k) => pieces.get(k));
    if (target === null || target >= Number.MAX_SAFE_INTEGER) {
      unknown.push(v.sku);
      continue;
    }
    if (target !== v.inventoryQty) {
      changes.push({ id: v.id, sku: v.sku, from: v.inventoryQty, to: target });
    }
  }
  return { packs, changes, unknown };
}
