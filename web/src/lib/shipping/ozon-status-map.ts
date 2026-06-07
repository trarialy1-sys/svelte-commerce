import { ParcelStatus } from "@/generated/prisma/client";

/**
 * Map an OzonExpress `STATUT` string onto our ParcelStatus enum.
 *
 * Exact-match on a normalized key (accent/case/space-insensitive). Unknown →
 * `null` ⇒ caller leaves the parcel unchanged (a wrong/incomplete vocabulary
 * can only no-op, never mis-map). The sync also records any unmapped status in
 * its audit row, so new vocabulary surfaces in production and gets added here.
 *
 * Confirmed live: "Nouveau Colis" → CREE. The rest follow Ozon's Title-Case
 * French convention (best-effort until seen in real data).
 */
const STATUS_MAP: Record<string, ParcelStatus> = {
  // → CREE (created / received, not yet picked up)
  "nouveau colis": ParcelStatus.CREE, // ← confirmed live
  "colis cree": ParcelStatus.CREE,
  nouveau: ParcelStatus.CREE,
  recu: ParcelStatus.CREE,
  "en attente": ParcelStatus.CREE,
  "en attente de ramassage": ParcelStatus.CREE,
  // → RAMASSE (picked up)
  "colis ramasse": ParcelStatus.RAMASSE,
  ramasse: ParcelStatus.RAMASSE,
  ramassage: ParcelStatus.RAMASSE,
  "pris en charge": ParcelStatus.RAMASSE,
  "au depot": ParcelStatus.RAMASSE,
  collecte: ParcelStatus.RAMASSE,
  // → EN_TRANSIT (shipped / out for delivery)
  "colis expedie": ParcelStatus.EN_TRANSIT,
  expedie: ParcelStatus.EN_TRANSIT,
  "en transit": ParcelStatus.EN_TRANSIT,
  "en cours de livraison": ParcelStatus.EN_TRANSIT,
  "mise en distribution": ParcelStatus.EN_TRANSIT,
  "en route": ParcelStatus.EN_TRANSIT,
  // → LIVRE (delivered)
  "colis livre": ParcelStatus.LIVRE,
  livre: ParcelStatus.LIVRE,
  delivered: ParcelStatus.LIVRE,
  // → RETOURNE (returned to sender)
  "colis retourne": ParcelStatus.RETOURNE,
  retourne: ParcelStatus.RETOURNE,
  retour: ParcelStatus.RETOURNE,
  "retour expediteur": ParcelStatus.RETOURNE,
  returned: ParcelStatus.RETOURNE,
  // → REFUSE (refused by recipient)
  "colis refuse": ParcelStatus.REFUSE,
  refuse: ParcelStatus.REFUSE,
  refused: ParcelStatus.REFUSE,
};

/** Normalize: trim, lowercase, strip accents, collapse whitespace. */
export function normalizeStatus(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the mapped ParcelStatus, or null for an unknown string (fail-safe). */
export function mapOzonStatus(raw: string | null | undefined): ParcelStatus | null {
  if (!raw) return null;
  return STATUS_MAP[normalizeStatus(raw)] ?? null;
}
