import "server-only";

import { SHEET_HEADERS, tabRange } from "@/lib/sheets/row";

/** Thin Google Sheets v4 REST client (fetch only, no SDK). */

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SheetsError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(1000 * attempt);
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) {
      const msg =
        res.status === 404
          ? "Feuille introuvable."
          : res.status === 403
            ? "Ce compte Google n'a pas accès en écriture à cette feuille."
            : json.error?.message ?? `Google Sheets HTTP ${res.status}`;
      throw new SheetsError(msg, res.status);
    }
    return json;
  }
  throw new SheetsError("Google Sheets indisponible.", 503);
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  url: string;
  tabs: string[];
}

export async function getSpreadsheet(token: string, id: string): Promise<SpreadsheetInfo> {
  const d = await call<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: { properties: { title: string } }[];
  }>(token, `${API}/${encodeURIComponent(id)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`);
  return {
    spreadsheetId: d.spreadsheetId,
    title: d.properties.title,
    url: d.spreadsheetUrl,
    tabs: d.sheets.map((s) => s.properties.title),
  };
}

/** New spreadsheet with one "Commandes" tab and a frozen header row. */
export async function createSpreadsheet(token: string, title: string): Promise<SpreadsheetInfo> {
  const tab = "Commandes";
  const d = await call<{ spreadsheetId: string; spreadsheetUrl: string }>(token, API, {
    method: "POST",
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: tab, gridProperties: { frozenRowCount: 1 } } }],
    }),
  });
  await call(token, `${API}/${d.spreadsheetId}/values/${encodeURIComponent(tabRange(tab, "A1:I1"))}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [SHEET_HEADERS] }),
  });
  return { spreadsheetId: d.spreadsheetId, title, url: d.spreadsheetUrl, tabs: [tab] };
}

/**
 * Add one row at the bottom of the tab. RAW keeps "+212…" and "#79950" as
 * text, exactly as typed, instead of letting Sheets turn them into numbers.
 */
export async function appendRow(token: string, id: string, tab: string, row: string[]): Promise<string | null> {
  const range = encodeURIComponent(tabRange(tab));
  const d = await call<{ updates?: { updatedRange?: string } }>(
    token,
    `${API}/${encodeURIComponent(id)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) }
  );
  return d.updates?.updatedRange ?? null;
}
