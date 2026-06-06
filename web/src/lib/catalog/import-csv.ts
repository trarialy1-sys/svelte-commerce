import "server-only";

import * as XLSX from "xlsx";
import { getOrgDb } from "@/lib/db";
import { computeStockState } from "@/lib/integrations/shopify/inventory";

type CsvRow = Record<string, unknown>;

/** First non-empty value among the given column headers (case-tolerant). */
function pick(row: CsvRow, normalized: Map<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = normalized.get(k.toLowerCase());
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function toNumber(raw: string): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

interface ParsedVariant {
  sku: string;
  price: number;
  cost: number | null;
  inventoryQty: number;
}
interface ParsedProduct {
  handle: string;
  title: string;
  status: string;
  imageUrl: string | null;
  variants: ParsedVariant[];
}

/**
 * Parse a Shopify product-export CSV into products grouped by Handle.
 * Shopify spreads one product across several rows: the first row carries the
 * product-level fields (Title, Status, Image Src); later rows (extra variants
 * or images) repeat the Handle with those fields blank. We carry the
 * product-level fields forward and collect every row that has a Variant SKU.
 */
function parseShopifyCsv(buffer: ArrayBuffer): ParsedProduct[] {
  const wb = XLSX.read(buffer, { type: "array", raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<CsvRow>(sheet, { defval: "" });

  const byHandle = new Map<string, ParsedProduct>();

  for (const row of rows) {
    // Normalize header keys to lowercase once per row for tolerant lookups.
    const normalized = new Map<string, unknown>();
    for (const [k, v] of Object.entries(row)) {
      normalized.set(k.toLowerCase().trim(), v);
    }

    const handle = pick(row, normalized, ["Handle"]);
    if (!handle) continue;

    let product = byHandle.get(handle);
    if (!product) {
      product = {
        handle,
        title: handle,
        status: "active",
        imageUrl: null,
        variants: [],
      };
      byHandle.set(handle, product);
    }

    const title = pick(row, normalized, ["Title"]);
    if (title) product.title = title;
    const status = pick(row, normalized, ["Status"]);
    if (status) product.status = status.toLowerCase();
    const image = pick(row, normalized, ["Image Src", "Image"]);
    if (image && !product.imageUrl) product.imageUrl = image;

    const sku = pick(row, normalized, ["Variant SKU", "SKU"]);
    if (sku) {
      const cost = pick(row, normalized, ["Cost per item", "Variant Cost"]);
      product.variants.push({
        sku,
        price: toNumber(pick(row, normalized, ["Variant Price", "Price"])),
        cost: cost ? toNumber(cost) : null,
        inventoryQty: Math.trunc(
          toNumber(
            pick(row, normalized, ["Variant Inventory Qty", "Inventory Qty"])
          )
        ),
      });
    }
  }

  return [...byHandle.values()];
}

/**
 * Import/upsert a Shopify product-export CSV into the org catalog.
 * Products are matched by (orgId, handle), variants by (orgId, sku) — so a
 * re-run updates price/inventory/title in place and only adds what's new.
 * Org-scoped via RLS.
 */
export async function importProductsCsv(
  orgId: string,
  buffer: ArrayBuffer
): Promise<{ products: number; variants: number; skipped: number }> {
  const parsed = parseShopifyCsv(buffer);
  const odb = getOrgDb(orgId);

  let products = 0;
  let variants = 0;
  let skipped = 0;

  for (const p of parsed) {
    if (p.variants.length === 0) {
      skipped++;
      continue;
    }

    const existingProduct = await odb.product.findFirst({
      where: { handle: p.handle },
      select: { id: true },
    });

    const productId = existingProduct
      ? (
          await odb.product.update({
            where: { id: existingProduct.id },
            data: {
              title: p.title,
              status: p.status,
              imageUrl: p.imageUrl,
              handle: p.handle,
            },
            select: { id: true },
          })
        ).id
      : (
          await odb.product.create({
            data: {
              orgId,
              title: p.title,
              status: p.status,
              imageUrl: p.imageUrl,
              handle: p.handle,
            },
            select: { id: true },
          })
        ).id;
    products++;

    for (const v of p.variants) {
      const data = {
        productId,
        sku: v.sku,
        price: v.price,
        cost: v.cost,
        inventoryQty: v.inventoryQty,
        title: p.title,
        status: p.status,
        stockState: computeStockState(v.inventoryQty),
      };
      const existingVariant = await odb.variant.findFirst({
        where: { sku: v.sku },
        select: { id: true },
      });
      if (existingVariant) {
        await odb.variant.update({
          where: { id: existingVariant.id },
          data,
        });
      } else {
        await odb.variant.create({ data: { orgId, ...data } });
      }
      variants++;
    }
  }

  return { products, variants, skipped };
}
