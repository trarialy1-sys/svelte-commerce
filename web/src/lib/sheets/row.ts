/**
 * Google Sheets order export — pure helpers (no I/O, unit-tested).
 *
 * The row matches what the Releasit COD app writes into the team's sheet, so
 * the sheet scripts (Ozon parcel creation, `suiviOzon`) keep working unchanged:
 *
 *   A date (YYYY-MM-DD, shop time zone)   "2026-11-12"
 *   B order number                        "#79950"
 *   C product + variant, one per line     "Cardigan en maille  - S / Noir"
 *   D SKU, one per line                   "Cardigan-Noir-S"
 *   E total price, no decimals when whole "329"
 *   F recipient                           "Prénom -"
 *   G address
 *   H phone, Releasit style               "+2120620944470"
 *   I city
 */

export const SHEET_HEADERS = [
  "Date",
  "Commande",
  "Produit",
  "SKU",
  "Prix",
  "Destinataire",
  "Adresse",
  "Téléphone",
  "Ville",
] as const;

export interface ExportLine {
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
}

export interface ExportOrder {
  name: string; // "#79950"
  createdAt: string; // ISO
  total: string | number; // "329.00"
  lines: ExportLine[];
  recipient: string;
  address: string;
  phone: string;
  city: string;
}

/** "2026-11-12" in the given time zone. */
export function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Releasit's product cell: "Title  - Variant" (two spaces), "Title  " with no variant. */
export function productCell(l: ExportLine): string {
  const v = l.variantTitle && l.variantTitle !== "Default Title" ? `- ${l.variantTitle}` : "";
  const qty = l.quantity > 1 ? ` (x${l.quantity})` : "";
  return `${l.title}  ${v}${qty}`;
}

/** "329.00" → "329", "149.50" → "149.5". */
export function priceCell(total: string | number): string {
  const n = Number(total);
  if (!Number.isFinite(n)) return String(total);
  return String(Math.round(n * 100) / 100);
}

/**
 * Releasit writes Moroccan numbers as "+212" + the local number with its 0
 * ("+2120620944470"). Anything that is not a Moroccan number is kept as is.
 */
export function phoneCell(raw: string): string {
  const d = (raw ?? "").replace(/[^\d+]/g, "");
  const m = /^(?:\+|00)?212(0?)([5-8]\d{8})$/.exec(d) ?? /^(0)([5-8]\d{8})$/.exec(d);
  return m ? `+2120${m[2]}` : (raw ?? "").trim();
}

export function buildOrderRow(o: ExportOrder, timeZone: string): string[] {
  return [
    localDate(o.createdAt, timeZone),
    o.name,
    o.lines.map(productCell).join("\n"),
    o.lines.map((l) => l.sku ?? "").join("\n"),
    priceCell(o.total),
    o.recipient.trim(),
    o.address.trim(),
    phoneCell(o.phone),
    o.city.trim(),
  ];
}

/** Spreadsheet id from a pasted URL or a bare id. Null if it looks wrong. */
export function parseSpreadsheetId(input: string): string | null {
  const s = (input ?? "").trim();
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

/** A1 range for a tab, quoting the name (tab names may have spaces, e.g. "Odes "). */
export function tabRange(tab: string, cols = "A:I"): string {
  return `'${tab.replace(/'/g, "''")}'!${cols}`;
}
