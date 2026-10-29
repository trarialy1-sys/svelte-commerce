/**
 * Pure parsing of an OzonExpress `tracking` response (no I/O → unit-testable).
 *
 * Endpoint: POST customers/{id}/{key}/tracking, form-data `tracking-number`.
 * Response (confirmed live):
 *   { CHECK_API:{RESULT,MESSAGE}, TRACKING:{ "TRACKING-NUMBER", RESULT, MESSAGE,
 *     HISTORY:{ "1":{STATUT,TIME,TIME_STR,COMMENT}, … }, LAST_TRACKING:{…} } }
 * An unknown code answers CHECK_API.RESULT = SUCCESS (valid key) but
 * TRACKING.RESULT = ERROR — so the key check alone is not enough.
 */

export interface OzonTracking {
  /** Last event's STATUT, e.g. "Retourné". */
  status: string;
  /** Last event's comment, cleaned ("Reçu par client"). */
  comment: string;
  /** Last event's TIME_STR, e.g. "2026-10-28 14:03". */
  eventAt: string | null;
  /** First event's TIME_STR = when the parcel was created at Ozon. */
  createdAt: string | null;
}

interface RawEvent {
  STATUT?: unknown;
  TIME?: unknown;
  TIME_STR?: unknown;
  COMMENT?: unknown;
}

interface RawTracking {
  CHECK_API?: { RESULT?: unknown; MESSAGE?: unknown };
  TRACKING?: {
    RESULT?: unknown;
    LAST_TRACKING?: RawEvent;
    HISTORY?: Record<string, RawEvent> | RawEvent[];
  };
}

/** Strip HTML and Ozon's "| Commentaire:" / "| Livreur:" prefixes. */
export function cleanOzonComment(raw: unknown): string {
  return String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;[^&]*&gt;/g, " ")
    .replace(/\|?\s*Commentaire\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s|]+|[\s|]+$/g, "");
}

export class OzonKeyError extends Error {}

/**
 * Parse a tracking response. Returns null when Ozon does not know the code.
 * Throws OzonKeyError when the API key itself is rejected.
 */
export function parseTracking(json: unknown): OzonTracking | null {
  const j = (json ?? {}) as RawTracking;
  if (String(j.CHECK_API?.RESULT ?? "").toUpperCase() === "ERROR") {
    throw new OzonKeyError(
      String(j.CHECK_API?.MESSAGE ?? "") || "OzonExpress: clé API invalide."
    );
  }
  const t = j.TRACKING;
  if (!t || String(t.RESULT ?? "").toUpperCase() !== "SUCCESS") return null;

  const history: RawEvent[] = Array.isArray(t.HISTORY)
    ? t.HISTORY
    : Object.values(t.HISTORY ?? {});
  const byTime = [...history].sort(
    (a, b) => Number(a.TIME ?? 0) - Number(b.TIME ?? 0)
  );
  const last = t.LAST_TRACKING ?? byTime[byTime.length - 1];
  const status = last?.STATUT != null ? String(last.STATUT).trim() : "";
  if (!status) return null;

  return {
    status,
    comment: cleanOzonComment(last?.COMMENT),
    eventAt: last?.TIME_STR != null ? String(last.TIME_STR) : null,
    createdAt: byTime[0]?.TIME_STR != null ? String(byTime[0].TIME_STR) : null,
  };
}
