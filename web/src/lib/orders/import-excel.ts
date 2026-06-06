import "server-only";

import * as XLSX from "xlsx";
import { OrderSource, OrderStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { upsertCustomerFromOrder } from "@/lib/customers/upsert";
import { parseCodeSuivi, parsePrice, restorePhone } from "./parse";

type ExcelRow = Record<string, unknown>;

function cell(row: ExcelRow, key: string): string {
  return String(row[key] ?? "").trim();
}

/**
 * Import an OzonExpress-format Excel export.
 * Columns: CODE SUIVI · DESTINATAIRE · TELEPHONE · ADRESSE · PRIX · VILLE · COMMENTAIRE
 */
export async function importExcel(
  orgId: string,
  fileBuffer: ArrayBuffer
): Promise<{ created: number; skipped: number }> {
  const wb = XLSX.read(fileBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: "" });

  const odb = getOrgDb(orgId);
  const variants = await odb.variant.findMany({ select: { sku: true, price: true } });
  const knownSkus = variants.map((v) => v.sku);
  const priceBySku = new Map(variants.map((v) => [v.sku, v.price]));

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const codeSuivi = cell(row, "CODE SUIVI");
    if (!codeSuivi) {
      skipped++;
      continue;
    }
    const { ref, skus } = parseCodeSuivi(codeSuivi, knownSkus);

    const existing = await odb.order.findUnique({
      where: { orgId_code: { orgId, code: ref } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const name = cell(row, "DESTINATAIRE");
    const phone = restorePhone(row["TELEPHONE"]);
    const address = cell(row, "ADRESSE");
    const cityRaw = cell(row, "VILLE");
    const note = cell(row, "COMMENTAIRE") || null;
    const totalPrice = parsePrice(row["PRIX"]);

    const customerId = await upsertCustomerFromOrder(orgId, {
      name,
      phone,
      city: cityRaw,
    });

    const order = await odb.order.create({
      data: {
        orgId,
        code: ref,
        customerId,
        cityRaw,
        address,
        phone,
        totalPrice,
        itemsCount: skus.length,
        status: OrderStatus.NOUVELLE,
        source: OrderSource.IMPORT,
        note,
      },
      select: { id: true },
    });

    for (const sku of skus) {
      await odb.orderItem.create({
        data: {
          orgId,
          orderId: order.id,
          sku,
          qty: 1,
          unitPrice: priceBySku.get(sku) ?? 0,
        },
      });
    }
    created++;
  }

  return { created, skipped };
}
