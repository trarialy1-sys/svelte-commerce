/**
 * Pure OzonExpress response helpers, ported from `ozon-send.js` and hardened per
 * the 1.4 locked decisions. No I/O here so they're unit-testable.
 */

/**
 * Recursively find the first value for `key` (case-insensitive), preferring
 * shallower matches. Used to deep-find the nested `TRACKING-NUMBER`
 * (ADD-PARCEL → NEW-PARCEL → TRACKING-NUMBER) while still working if Ozon
 * returns it at the top level.
 */
export function deepFindKey(obj: unknown, key: string): unknown {
  const want = key.toLowerCase();
  let result: unknown;
  const walk = (o: unknown): boolean => {
    if (o == null || typeof o !== "object") return false;
    if (Array.isArray(o)) {
      for (const it of o) if (walk(it)) return true;
      return false;
    }
    const entries = Object.entries(o as Record<string, unknown>);
    for (const [k, v] of entries) {
      if (k.toLowerCase() === want && v != null && typeof v !== "object") {
        result = v;
        return true;
      }
    }
    for (const [, v] of entries) if (walk(v)) return true;
    return false;
  };
  walk(obj);
  return result;
}

/**
 * Extract the error message that sits next to `RESULT: "ERROR"` — deliberately
 * NOT the always-present `CUSTOMER: "Valid Customer"`. Falls back to a generic
 * message.
 */
export function errMsg(json: unknown): string {
  let msg: string | undefined;
  const walk = (o: unknown): boolean => {
    if (o == null || typeof o !== "object") return false;
    if (Array.isArray(o)) {
      for (const it of o) if (walk(it)) return true;
      return false;
    }
    const entries = Object.entries(o as Record<string, unknown>);
    const result = entries.find(([k]) => k.toLowerCase() === "result");
    if (result && String(result[1]).toLowerCase() === "error") {
      const m = entries.find(([k]) => k.toLowerCase() === "message");
      if (m && m[1] != null) {
        msg = String(m[1]);
        return true;
      }
    }
    for (const [, v] of entries) if (walk(v)) return true;
    return false;
  };
  walk(json);
  return msg || "Erreur OzonExpress inconnue.";
}

/** True when Ozon reports the tracking number already exists. */
export function isUsedBefore(message: string): boolean {
  return /used before/i.test(message);
}

/** True if the response contains a `RESULT: "ERROR"` node anywhere. */
export function ozonHasError(json: unknown): boolean {
  let found = false;
  const walk = (o: unknown): void => {
    if (found || o == null || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    const entries = Object.entries(o as Record<string, unknown>);
    if (
      entries.some(
        ([k, v]) =>
          k.toLowerCase() === "result" && String(v).toLowerCase() === "error"
      )
    ) {
      found = true;
      return;
    }
    for (const [, v] of entries) walk(v);
  };
  walk(json);
  return found;
}

/**
 * Find the delivery-note ref. Ozon returns it as `ref`; we also scan any value
 * matching /^BL[-_]/i as a fallback (per the brief).
 */
export function findBLRef(json: unknown): string | null {
  const direct = deepFindKey(json, "ref");
  if (typeof direct === "string" && /^BL[-_]/i.test(direct)) return direct;

  let found: string | null = null;
  const walk = (o: unknown) => {
    if (found || o == null || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    for (const v of Object.values(o as Record<string, unknown>)) {
      if (typeof v === "string" && /^BL[-_]/i.test(v)) {
        found = v;
        return;
      }
      walk(v);
    }
  };
  walk(json);
  return found ?? (typeof direct === "string" ? direct : null);
}

/** Moroccan phone normalizer → `0XXXXXXXXX` (10 digits). Handles +212 / 00212,
 *  a stray leading 0 after the country code, spaces, and bare 9-digit numbers. */
export function formatPhone(tel: unknown): string {
  let s = String(tel ?? "").replace(/[^\d]/g, "");
  if (s.startsWith("00")) s = s.slice(2); // 00212… → 212…
  if (s.startsWith("212")) s = s.slice(3); // strip the MA country code
  if (s.length === 9 && /^[5-7]/.test(s)) return "0" + s; // 6/7/5XXXXXXXX → 0…
  if (s.length === 10 && s.startsWith("0")) return s; // already local
  return s;
}
