import type { OzonCreds } from "../types";

export interface OzonTestResult {
  ok: boolean;
  /** true when creds are stored but not yet verified against the live API. */
  unverified: boolean;
  message: string;
}

/**
 * OzonExpress has no guaranteed non-mutating auth-check endpoint we can rely on
 * here (and we must never create a parcel to test). Per the brief: validate the
 * id/key format, store, and mark `unverified` — the first real send (Chunk 1.4)
 * confirms the credentials. Drop in a confirmed read endpoint here later.
 */
export async function testOzon(creds: OzonCreds): Promise<OzonTestResult> {
  if (!creds.customerId.trim() || !creds.apiKey.trim()) {
    return { ok: false, unverified: false, message: "ID client et clé API requis" };
  }
  return {
    ok: true,
    unverified: true,
    message:
      "Identifiants enregistrés (non vérifiés — la première expédition confirmera)",
  };
}
