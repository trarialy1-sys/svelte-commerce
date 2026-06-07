const DEFAULT_CURRENCY = "MAD";

/** Money in fr-FR formatting with the org currency (DH for MAD). */
export function formatMoney(
  value: number | string | null | undefined,
  currency: string = DEFAULT_CURRENCY
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return "—";
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return currency === "MAD" ? `${formatted} DH` : `${formatted} ${currency}`;
}

/** Plain number, fr-FR grouping. */
export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR").format(n);
}

/** Localized short date. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Localized date + time (for audit timestamps). */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** ISO date (yyyy-mm-dd) for exports/sorting. */
export function formatDateISO(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Moroccan display phone: re-add the leading 0 dropped by Excel imports
 * (9 digits → 0XXXXXXXXX), strip a +212 / 212 country prefix, then group.
 */
export function displayPhoneMA(value: string | null | undefined): string {
  if (!value) return "—";
  let p = String(value).replace(/\D/g, "");
  if (p.startsWith("212")) p = `0${p.slice(3)}`;
  if (p.length === 9 && !p.startsWith("0")) p = `0${p}`;
  return formatPhone(p);
}

/** Light phone grouping (Moroccan-style, non-destructive). */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\s+/g, "");
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
