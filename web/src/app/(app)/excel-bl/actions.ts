"use server";

import * as XLSX from "xlsx";

import { requireOrgRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { getCityResolver } from "@/lib/shipping/resolve";
import { learnCityAlias } from "@/lib/shipping/learn";
import { missingShippingFields } from "@/lib/shipping/validate";
import { createParcelRaw } from "@/lib/shipping/ozon";
import { createDeliveryNote, type BLResult } from "@/lib/shipping/bl";
import { parseCodeSuivi, parsePrice, restorePhone } from "@/lib/orders/parse";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/** Confident detections accepted without a manual pick. */
const CONFIDENT = new Set(["alias", "exact", "casa", "fuzzy"]);

export interface ExcelBLRow {
  id: string;
  tracking: string; // CODE SUIVI
  customer: string;
  phone: string;
  address: string;
  cityRaw: string;
  price: number;
  note: string | null;
  skus: string[];
  cityId: number | null; // resolved (or confidently detected)
  cityName: string; // resolved/suggested name
  method: string; // resolution method
  cityOk: boolean; // confidently resolved
  missing: string[]; // missing required fields (besides city)
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

/**
 * Parse an OzonExpress-format Excel and resolve each row's city against the Ozon
 * catalog (Arabic-aware). No DB writes — returns a preview for the operator to
 * fix any unresolved cities before shipping.
 * Columns: CODE SUIVI · DESTINATAIRE · TELEPHONE · ADRESSE · PRIX · VILLE · COMMENTAIRE
 */
export async function parseExcelBLAction(
  formData: FormData
): Promise<Result<{ rows: ExcelBLRow[]; cities: { id: number; name: string }[] }>> {
  const { orgId } = await requireOrgRole("operator");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Aucun fichier fourni." };
  }

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const odb = getOrgDb(orgId!);
    const variants = await odb.variant.findMany({ select: { sku: true } });
    const knownSkus = variants.map((v) => v.sku);
    const resolver = await getCityResolver(orgId!);

    const rows: ExcelBLRow[] = [];
    let i = 0;
    for (const r of raw) {
      const tracking = cell(r, "CODE SUIVI");
      if (!tracking) continue; // skip blank lines
      const customer = cell(r, "DESTINATAIRE");
      const phone = restorePhone(r["TELEPHONE"]);
      const address = cell(r, "ADRESSE");
      const cityRaw = cell(r, "VILLE");
      const note = cell(r, "COMMENTAIRE") || null;
      const price = parsePrice(r["PRIX"]);
      const { skus } = parseCodeSuivi(tracking, knownSkus);

      const res = resolver.closest(cityRaw, address);
      const cityOk = res.cityId != null && CONFIDENT.has(res.method);

      rows.push({
        id: String(i++),
        tracking,
        customer,
        phone,
        address,
        cityRaw,
        price,
        note,
        skus,
        cityId: cityOk ? res.cityId : null,
        cityName: resolver.cityName(res.cityId),
        method: res.method,
        cityOk,
        missing: missingShippingFields({ customerName: customer, phone, address, price }),
      });
    }

    if (rows.length === 0) {
      return { ok: false, message: "Aucune ligne avec un CODE SUIVI trouvée." };
    }
    return { ok: true, data: { rows, cities: resolver.cities } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec de lecture du fichier." };
  }
}

export interface ExcelBLSendRow {
  id: string;
  tracking: string;
  customer: string;
  phone: string;
  address: string;
  cityRaw: string;
  cityId: number | null;
  price: number;
  note: string | null;
  skus: string[];
}

export interface ExcelBLResult {
  results: { id: string; tracking: string; ok: boolean; error?: string; blocked?: boolean }[];
  sent: number;
  blocked: number;
  bl: BLResult | null;
  blError: string | null;
}

/**
 * ⚠️ LIVE: create the OzonExpress parcels for every row that has a resolved city,
 * then group them into one BL. Standalone — no Order/Parcel rows are written; only
 * the DeliveryNote is recorded. Rows without a city are blocked (never shipped to
 * a guess) and reported back.
 */
export async function createExcelBLAction(
  rows: ExcelBLSendRow[]
): Promise<Result<ExcelBLResult>> {
  const { orgId, userId } = await requireOrgRole("operator");
  if (!rows.length) return { ok: false, message: "Aucune ligne à expédier." };

  try {
    const results: ExcelBLResult["results"] = [];
    const codes: string[] = [];

    for (const row of rows) {
      if (row.cityId == null) {
        results.push({
          id: row.id,
          tracking: row.tracking,
          ok: false,
          blocked: true,
          error: `Ville « ${row.cityRaw || "?"} » introuvable — à corriger.`,
        });
        continue;
      }
      // Learn the alias so a fixed city is remembered next time.
      if (row.cityRaw) await learnCityAlias(orgId!, row.cityRaw, row.cityId, userId);

      const res = await createParcelRaw(orgId!, {
        tracking: row.tracking,
        receiver: row.customer,
        phone: row.phone,
        cityId: row.cityId,
        address: row.address,
        price: row.price,
        note: row.note,
        products: row.skus.map((sku) => ({ ref: sku, qnty: 1 })),
      });
      if (res.ok || res.usedBefore) {
        const code = res.tracking || row.tracking;
        if (code) codes.push(code);
        results.push({ id: row.id, tracking: code, ok: true });
      } else {
        results.push({ id: row.id, tracking: row.tracking, ok: false, error: res.error });
      }
    }

    let bl: BLResult | null = null;
    let blError: string | null = null;
    if (codes.length > 0) {
      try {
        bl = await createDeliveryNote(orgId!, codes, userId);
      } catch (e) {
        blError = e instanceof Error ? e.message : "Échec de la création du BL.";
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const blocked = results.filter((r) => r.blocked).length;
    return { ok: true, data: { results, sent, blocked, bl, blError } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}
