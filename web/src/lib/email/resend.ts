import "server-only";

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** True when Resend is wired (API key + a verified-domain sender address). */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;
}

/** Base URL for absolute links in emails. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://svelte-commerce-rosy.vercel.app")
  );
}

/** Build a `From` header using the org display name + the platform sender. */
export function fromHeader(displayName: string): string {
  const raw = process.env.RESEND_FROM ?? "";
  const m = raw.match(/<([^>]+)>/);
  const email = (m ? m[1] : raw).trim();
  const safeName = displayName.replace(/[<>"]/g, "").trim() || "Partner OS";
  return `${safeName} <${email}>`;
}

/**
 * Send a single email via the Resend HTTP API (no SDK dependency; works on
 * Vercel serverless). Live once RESEND_API_KEY + a verified RESEND_FROM domain
 * are set; returns a clear error otherwise.
 */
export async function sendEmail(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY manquant" };
  if (!process.env.RESEND_FROM)
    return { ok: false, error: "RESEND_FROM (domaine vérifié) manquant" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec d'envoi" };
  }
}
