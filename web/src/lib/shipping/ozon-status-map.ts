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
  // → CREE (created, waiting for pickup)
  "nouveau colis": ParcelStatus.CREE, // ← confirmed live
  "colis cree": ParcelStatus.CREE,
  nouveau: ParcelStatus.CREE,
  "en attente": ParcelStatus.CREE,
  "en attente de ramassage": ParcelStatus.CREE,
  "attente de ramassage": ParcelStatus.CREE, // ← confirmed live
  "pre ramasse": ParcelStatus.CREE,
  // → RAMASSE (picked up)
  "colis ramasse": ParcelStatus.RAMASSE,
  ramasse: ParcelStatus.RAMASSE, // ← confirmed live
  ramassage: ParcelStatus.RAMASSE,
  "pris en charge": ParcelStatus.RAMASSE,
  "au depot": ParcelStatus.RAMASSE,
  collecte: ParcelStatus.RAMASSE,
  // → EN_TRANSIT (shipped, at the delivery agency, out for delivery, delivery
  //   attempts). NB: "Reçu" = received by the DELIVERY agency (after
  //   "Expédié"), not a new parcel — confirmed from live tracking histories.
  "colis expedie": ParcelStatus.EN_TRANSIT,
  expedie: ParcelStatus.EN_TRANSIT, // ← confirmed live
  "expedier par amana": ParcelStatus.EN_TRANSIT,
  "envoye a l'agence": ParcelStatus.EN_TRANSIT,
  recu: ParcelStatus.EN_TRANSIT, // ← confirmed live
  "recu en agence de livraison": ParcelStatus.EN_TRANSIT,
  "en transit": ParcelStatus.EN_TRANSIT,
  "en voyage": ParcelStatus.EN_TRANSIT,
  "en cours": ParcelStatus.EN_TRANSIT,
  "en cours de livraison": ParcelStatus.EN_TRANSIT,
  "mise en distribution": ParcelStatus.EN_TRANSIT, // ← confirmed live
  "en route": ParcelStatus.EN_TRANSIT,
  programme: ParcelStatus.EN_TRANSIT,
  reporte: ParcelStatus.EN_TRANSIT, // ← confirmed live
  "reporte ( suivi )": ParcelStatus.EN_TRANSIT,
  "reporte aujourd hui": ParcelStatus.EN_TRANSIT,
  retarde: ParcelStatus.EN_TRANSIT,
  "retard livraison 48h-72h": ParcelStatus.EN_TRANSIT,
  "pas de reponse + sms": ParcelStatus.EN_TRANSIT, // ← confirmed live
  "pas de reponse j+2": ParcelStatus.EN_TRANSIT, // ← confirmed live
  "pas de reponse j+3": ParcelStatus.EN_TRANSIT, // ← confirmed live
  "pas de reponse ( suivi )": ParcelStatus.EN_TRANSIT,
  "pas reponse +deplacement": ParcelStatus.EN_TRANSIT, // ← confirmed live
  "pas reponse + deplacement j+2": ParcelStatus.EN_TRANSIT,
  "pas reponse + deplacement j+3": ParcelStatus.EN_TRANSIT,
  injoignable: ParcelStatus.EN_TRANSIT,
  "injoignable ( suivi )": ParcelStatus.EN_TRANSIT,
  "boite vocal": ParcelStatus.EN_TRANSIT,
  "boite vocal ( suivi )": ParcelStatus.EN_TRANSIT,
  "client interesse": ParcelStatus.EN_TRANSIT,
  "erreur numero": ParcelStatus.EN_TRANSIT,
  "sans adresse": ParcelStatus.EN_TRANSIT,
  "hors-zone": ParcelStatus.EN_TRANSIT,
  "hors secteur": ParcelStatus.EN_TRANSIT,
  "zone non-couverte": ParcelStatus.EN_TRANSIT,
  // → LIVRE (delivered)
  "colis livre": ParcelStatus.LIVRE,
  livre: ParcelStatus.LIVRE, // ← confirmed live
  delivered: ParcelStatus.LIVRE,
  // → RETOURNE (on the way back / back at the merchant — the comment
  //   "Reçu par client" tells the two apart, see isReturnReceived)
  "colis retourne": ParcelStatus.RETOURNE,
  retourne: ParcelStatus.RETOURNE, // ← confirmed live
  retour: ParcelStatus.RETOURNE,
  "retour expediteur": ParcelStatus.RETOURNE,
  "en retour par amana": ParcelStatus.RETOURNE,
  returned: ParcelStatus.RETOURNE,
  // → REFUSE (refused / cancelled — the parcel is still coming back)
  "colis refuse": ParcelStatus.REFUSE,
  refuse: ParcelStatus.REFUSE, // ← confirmed live
  refused: ParcelStatus.REFUSE,
  annule: ParcelStatus.REFUSE,
  "annule ( suivi )": ParcelStatus.REFUSE,
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
  const key = normalizeStatus(raw);
  const exact = STATUS_MAP[key];
  if (exact) return exact;
  // Safe prefix fallbacks for Ozon's many delivery-attempt variants.
  if (/^(pas de reponse|pas reponse|injoignable|boite vocal|reporte)/.test(key)) {
    return ParcelStatus.EN_TRANSIT;
  }
  return null;
}

/**
 * The return is physically back at the merchant: Ozon keeps the status
 * "Retourné" through the whole way back and only the last event's comment says
 * "Reçu par client" (client = the merchant, Ozon's customer). Confirmed live.
 */
export function isReturnReceived(
  status: string | null | undefined,
  comment: string | null | undefined
): boolean {
  if (!status || !comment) return false;
  return (
    normalizeStatus(status).startsWith("retourn") &&
    /recu par client/.test(normalizeStatus(comment))
  );
}
