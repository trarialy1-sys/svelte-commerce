import { ParcelStatus } from "@/generated/prisma/client";

/**
 * Map an OzonExpress status string onto our ParcelStatus enum.
 *
 * ⚠️ CONFIRM: the exact Ozon status vocabulary is not yet verified. This table
 * is **exact-match on a normalized key** (accent/case/space-insensitive), so an
 * unrecognized string returns `null` and the caller leaves the parcel
 * unchanged — a wrong/incomplete vocabulary can never *mis-map*, only no-op.
 * Add the real strings here once confirmed against live Ozon responses.
 */
const STATUS_MAP: Record<string, ParcelStatus> = {
  // → CREE (created / received, not yet picked up)
  "nouveau colis": ParcelStatus.CREE,
  "colis cree": ParcelStatus.CREE,
  nouveau: ParcelStatus.CREE,
  recu: ParcelStatus.CREE,
  "en attente": ParcelStatus.CREE,
  // → RAMASSE (picked up)
  ramasse: ParcelStatus.RAMASSE,
  ramassage: ParcelStatus.RAMASSE,
  "pris en charge": ParcelStatus.RAMASSE,
  collecte: ParcelStatus.RAMASSE,
  // → EN_TRANSIT (out for / in delivery)
  "en cours de livraison": ParcelStatus.EN_TRANSIT,
  "en transit": ParcelStatus.EN_TRANSIT,
  expedie: ParcelStatus.EN_TRANSIT,
  "en route": ParcelStatus.EN_TRANSIT,
  "mise en distribution": ParcelStatus.EN_TRANSIT,
  // → LIVRE (delivered)
  livre: ParcelStatus.LIVRE,
  delivered: ParcelStatus.LIVRE,
  // → RETOURNE (returned to sender)
  retourne: ParcelStatus.RETOURNE,
  retour: ParcelStatus.RETOURNE,
  "retour expediteur": ParcelStatus.RETOURNE,
  returned: ParcelStatus.RETOURNE,
  // → REFUSE (refused by recipient)
  refuse: ParcelStatus.REFUSE,
  "colis refuse": ParcelStatus.REFUSE,
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
