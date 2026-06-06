import { tokenizeSku } from "@/lib/catalog/tokenize";

function norm(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

/**
 * Greedy longest-prefix decomposition of a hyphen-joined SKU segment.
 * OzonExpress joins SKUs with "-", but SKUs themselves can contain "-"
 * (e.g. "BL100-A"). We try the longest known SKU first at each position (so
 * "BL100-A" wins over "BL100"), and treat any leftover "-" as a separator.
 * Returns null if the segment can't be fully decomposed into known SKUs.
 */
function decomposeHyphenated(
  segment: string,
  knownSkus: string[]
): string[] | null {
  const s = norm(segment);
  if (!s) return null;
  const byNorm = new Map<string, string>();
  for (const sku of knownSkus) byNorm.set(norm(sku), sku);
  const sorted = [...byNorm.keys()].sort((a, b) => b.length - a.length);

  const result: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "-") {
      i += 1; // separator between SKUs
      continue;
    }
    const match = sorted.find((sku) => s.startsWith(sku, i));
    if (!match) return null;
    result.push(byNorm.get(match)!);
    i += match.length;
  }
  return result.length ? result : null;
}

/**
 * Parse an OzonExpress "CODE SUIVI" cell, e.g.
 *   "NK60-BL100-A-BL103-BL81_BEN4291"
 * Split on the LAST underscore → left = SKU segment, right = order ref.
 * The SKU segment is decomposed against the catalog (SKUs contain hyphens, so
 * we never split naïvely on "-"); on failure we fall back to the OCR tokenizer.
 */
export function parseCodeSuivi(
  codeSuivi: string,
  knownSkus: string[]
): { ref: string; skus: string[] } {
  const raw = codeSuivi.trim();
  const lastUnderscore = raw.lastIndexOf("_");
  let skuSegment = raw;
  let ref = raw;
  if (lastUnderscore > 0) {
    skuSegment = raw.slice(0, lastUnderscore);
    ref = raw.slice(lastUnderscore + 1);
  }
  const skus =
    decomposeHyphenated(skuSegment, knownSkus) ??
    tokenizeSku(skuSegment, knownSkus);
  return { ref, skus };
}

/**
 * Excel stores phone numbers as numbers, dropping the leading 0.
 * Moroccan numbers are 10 digits starting with 0 → restore it.
 */
export function restorePhone(raw: unknown): string {
  let p = String(raw ?? "").replace(/\D/g, "");
  if (p.length === 9 && !p.startsWith("0")) p = `0${p}`;
  return p;
}

/** Parse a price cell tolerant of "1 234,50", "1234.50", "1234 DH", etc. */
export function parsePrice(raw: unknown): number {
  const s = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
