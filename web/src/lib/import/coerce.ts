import { parsePrice, restorePhone } from "@/lib/orders/parse";
import { tokenizeSku } from "@/lib/catalog/tokenize";
import type { MappedRow } from "./types";

export interface CoerceResult<T> {
  value?: T;
  errors: string[];
}

const s = (v: string | undefined) => (v ?? "").trim();

// ── Customers ────────────────────────────────────────────────────────────────
export interface CustomerValue {
  phone: string;
  name: string;
  nameProvided: boolean;
  city: string | null;
  tags: string[];
}

export function coerceCustomer(raw: MappedRow): CoerceResult<CustomerValue> {
  const errors: string[] = [];
  const phone = restorePhone(raw.phone);
  if (!phone) errors.push("Téléphone requis");
  const name = s(raw.name);
  const city = s(raw.city) || null;
  const tags = s(raw.tags)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (errors.length) return { errors };
  return {
    value: { phone, name: name || "Client", nameProvided: !!name, city, tags },
    errors,
  };
}

// ── Products / Variants ──────────────────────────────────────────────────────
export interface ProductValue {
  sku: string;
  title: string | null;
  price: number;
  inventoryQty: number;
  cost: number | null;
  category: string | null;
}

export function coerceProduct(raw: MappedRow): CoerceResult<ProductValue> {
  const errors: string[] = [];
  const sku = s(raw.sku);
  if (!sku) errors.push("SKU requis");
  const title = s(raw.title) || null;
  const price = s(raw.price) ? parsePrice(raw.price) : 0;
  let inventoryQty = 0;
  if (s(raw.inventoryQty)) {
    const n = parseInt(s(raw.inventoryQty).replace(/[^\d-]/g, ""), 10);
    if (Number.isNaN(n)) errors.push("Stock invalide");
    else inventoryQty = n;
  }
  const cost = s(raw.cost) ? parsePrice(raw.cost) : null;
  const category = s(raw.category) || null;
  if (errors.length) return { errors };
  return { value: { sku, title, price, inventoryQty, cost, category }, errors };
}

// ── Orders ───────────────────────────────────────────────────────────────────
export interface OrderValue {
  code: string;
  name: string;
  nameProvided: boolean;
  phone: string;
  city: string;
  address: string | null;
  totalPrice: number;
  note: string | null;
  skus: string[];
}

export function coerceOrder(
  raw: MappedRow,
  knownSkus: string[]
): CoerceResult<OrderValue> {
  const errors: string[] = [];
  const code = s(raw.code);
  if (!code) errors.push("Référence requise");
  const phone = restorePhone(raw.phone);
  if (!phone) errors.push("Téléphone requis");
  const name = s(raw.customerName);
  const city = s(raw.city);
  const address = s(raw.address) || null;
  const totalPrice = s(raw.totalPrice) ? parsePrice(raw.totalPrice) : 0;
  const note = s(raw.note) || null;
  const skuRaw = s(raw.sku);
  const skus = skuRaw ? tokenizeSku(skuRaw, knownSkus) : [];
  if (errors.length) return { errors };
  return {
    value: {
      code,
      name: name || "Client",
      nameProvided: !!name,
      phone,
      city,
      address,
      totalPrice,
      note,
      skus,
    },
    errors,
  };
}
