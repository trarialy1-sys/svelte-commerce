/**
 * Codes d'envoi built by the Google Sheet export (pure → unit-testable):
 *   {SKUs collés}_{3 premières lettres de la ville, en majuscules}{4 derniers chiffres du tél}
 * Orders split into one parcel per item use `{SKU}_{…}` for each item.
 */

/** City part exactly like the sheet's export: trim → UPPERCASE → first 3 chars. */
export function sheetCity3(city: string | null | undefined): string {
  return String(city ?? "").trim().toUpperCase().substring(0, 3);
}

/** Candidate codes d'envoi for an order (most likely first, deduped). */
export function candidateCodes(order: {
  skus: string[];
  cityRaw: string | null;
  phone: string | null;
}): string[] {
  const last4 = String(order.phone ?? "").replace(/\D/g, "").slice(-4);
  const skus = order.skus.map((s) => s.trim()).filter(Boolean);
  if (last4.length < 4 || skus.length === 0) return [];
  const suffix = `_${sheetCity3(order.cityRaw)}${last4}`;
  const out = [skus.join("") + suffix];
  if (skus.length > 1) for (const s of skus) out.push(s + suffix);
  return [...new Set(out)];
}
