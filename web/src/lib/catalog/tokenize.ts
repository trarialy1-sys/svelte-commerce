/**
 * Match raw OCR text against a set of known catalog SKUs.
 *
 * SKUs contain hyphens, so we never split naïvely on `-`. Strategy:
 *  1) exact (normalized) match,
 *  2) greedy longest-prefix decomposition — only accept a split if EVERY piece
 *     is a known SKU (handles labels where several codes run together),
 *  3) light fuzzy tolerance (Levenshtein ≤ threshold) for OCR noise.
 */

function norm(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Greedy longest-prefix decomposition of `s` into known normalized SKUs. */
function decompose(s: string, normalizedSorted: string[]): string[] | null {
  const result: string[] = [];
  let i = 0;
  while (i < s.length) {
    const match = normalizedSorted.find((sku) => s.startsWith(sku, i));
    if (!match) return null;
    result.push(match);
    i += match.length;
  }
  return result.length ? result : null;
}

export function tokenizeSku(raw: string, knownSkus: string[]): string[] {
  const r = norm(raw);
  if (!r) return [];

  // normalized -> original SKU
  const byNorm = new Map<string, string>();
  for (const sku of knownSkus) byNorm.set(norm(sku), sku);

  // 1) exact
  if (byNorm.has(r)) return [byNorm.get(r)!];

  // 2) greedy decomposition (longest SKUs first to avoid premature short matches)
  const normalizedSorted = [...byNorm.keys()].sort((a, b) => b.length - a.length);
  const decomp = decompose(r, normalizedSorted);
  if (decomp) return decomp.map((n) => byNorm.get(n)!);

  // 3) fuzzy whole-string match (tolerate small OCR noise)
  const threshold = r.length <= 5 ? 1 : 2;
  let best: { sku: string; dist: number } | null = null;
  for (const [n, original] of byNorm) {
    const d = levenshtein(r, n);
    if (d <= threshold && (!best || d < best.dist)) {
      best = { sku: original, dist: d };
    }
  }
  return best ? [best.sku] : [];
}
