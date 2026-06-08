import { formatMoney } from "@/lib/format";
import type { DigestSummary } from "./summary";

type Lang = "fr" | "en";

const T: Record<Lang, Record<string, string>> = {
  fr: {
    subject: "Résumé du",
    heading: "Résumé de la journée",
    pulse: "Activité",
    newOrders: "Nouvelles commandes",
    confirmed: "Confirmées",
    shipped: "Expédiées",
    delivered: "Livrées",
    returns: "Retours / refus",
    attention: "À traiter",
    aConfirmer: "à confirmer",
    problemes: "colis en problème",
    oos: "articles en rupture",
    cod: "COD",
    livre: "Livré (à encaisser)",
    enAttente: "En attente de versement",
    open: "Ouvrir",
    footer: "Vous recevez ce résumé en tant qu'administrateur de",
  },
  en: {
    subject: "Summary for",
    heading: "Daily summary",
    pulse: "Activity",
    newOrders: "New orders",
    confirmed: "Confirmed",
    shipped: "Shipped",
    delivered: "Delivered",
    returns: "Returns / refused",
    attention: "To handle",
    aConfirmer: "to confirm",
    problemes: "parcels in trouble",
    oos: "out-of-stock items",
    cod: "COD",
    livre: "Delivered (to collect)",
    enAttente: "Awaiting remittance",
    open: "Open",
    footer: "You receive this summary as an admin of",
  },
};

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDigest(s: DigestSummary, baseUrl: string): RenderedEmail {
  const lang: Lang = s.org.locale === "en" ? "en" : "fr";
  const t = T[lang];
  const money = (n: number) => formatMoney(n, s.org.currency);
  const brand = s.org.brandColor || "#4f46e5";
  const url = (path: string) => `${baseUrl}${path}`;

  const subject = `${t.subject} ${s.date} · ${s.org.name}`;

  const links = {
    aConfirmer: url("/orders?status=NOUVELLE"),
    problemes: url("/shipping"),
    oos: url("/stock?stockState=RUPTURE"),
  };

  // ── Plaintext ──────────────────────────────────────────────────────────────
  const text = [
    `${t.heading} — ${s.date}`,
    s.org.name,
    "",
    `${t.pulse}:`,
    `  ${t.newOrders}: ${s.pulse.newOrders}`,
    `  ${t.confirmed}: ${s.pulse.confirmed}`,
    `  ${t.shipped}: ${s.pulse.shipped}`,
    `  ${t.delivered}: ${s.pulse.delivered}`,
    `  ${t.returns}: ${s.pulse.returns}`,
    "",
    `${t.attention}:`,
    `  ${s.attention.aConfirmer} ${t.aConfirmer} — ${links.aConfirmer}`,
    `  ${s.attention.problemes} ${t.problemes} — ${links.problemes}`,
    `  ${s.attention.oos} ${t.oos} — ${links.oos}`,
    "",
    `${t.cod}:`,
    `  ${t.livre}: ${money(s.cod.livreAEncaisser)}`,
    `  ${t.enAttente}: ${money(s.cod.enAttente)}`,
    "",
    url("/dashboard"),
  ].join("\n");

  // ── HTML (inline styles for email clients) ──────────────────────────────────
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#555;font-size:14px">${label}</td>` +
    `<td style="padding:6px 0;text-align:right;font-weight:600;font-size:14px">${value}</td></tr>`;

  const actionRow = (count: number, label: string, href: string) =>
    `<tr><td style="padding:6px 0;font-size:14px">` +
    `<a href="${href}" style="color:${brand};text-decoration:none">${count} ${label} →</a>` +
    `</td></tr>`;

  const header = s.org.logoUrl
    ? `<img src="${s.org.logoUrl}" alt="${s.org.name}" height="36" style="height:36px;display:block" />`
    : `<div style="font-size:20px;font-weight:700;color:${brand}">${s.org.name}</div>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #eee">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:14px">
        ${header}
        <div style="color:#888;font-size:13px">${t.heading}<br/><strong style="color:#333">${s.date}</strong></div>
      </div>

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#999;margin:20px 0 6px">${t.pulse}</h3>
      <table style="width:100%;border-collapse:collapse">
        ${row(t.newOrders, String(s.pulse.newOrders))}
        ${row(t.confirmed, String(s.pulse.confirmed))}
        ${row(t.shipped, String(s.pulse.shipped))}
        ${row(t.delivered, String(s.pulse.delivered))}
        ${row(t.returns, String(s.pulse.returns))}
      </table>

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#999;margin:20px 0 6px">${t.attention}</h3>
      <table style="width:100%;border-collapse:collapse">
        ${actionRow(s.attention.aConfirmer, t.aConfirmer, links.aConfirmer)}
        ${actionRow(s.attention.problemes, t.problemes, links.problemes)}
        ${actionRow(s.attention.oos, t.oos, links.oos)}
      </table>

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#999;margin:20px 0 6px">${t.cod}</h3>
      <table style="width:100%;border-collapse:collapse">
        ${row(t.livre, money(s.cod.livreAEncaisser))}
        ${row(t.enAttente, money(s.cod.enAttente))}
      </table>

      <div style="margin-top:24px;text-align:center">
        <a href="${url("/dashboard")}" style="background:${brand};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;display:inline-block">${t.open}</a>
      </div>
    </div>
    <p style="color:#aaa;font-size:12px;text-align:center;margin-top:16px">${t.footer} ${s.org.name}.</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
