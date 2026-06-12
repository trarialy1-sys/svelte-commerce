import type { ModuleConfig } from "@/lib/module/types";

const COLUMNS: ModuleConfig["columns"] = [
  { key: "sku", label: "SKU", type: "mono", sortable: true },
  { key: "title", label: "Produit", type: "text", sortable: true },
  { key: "sold30", label: "Ventes 30j", type: "number", align: "right" },
  {
    key: "inventoryQty",
    label: "Quantité",
    type: "number",
    align: "right",
    sortable: true,
  },
  {
    key: "stockState",
    label: "État",
    type: "badge",
    badgeMap: { EN_STOCK: "green", FAIBLE: "amber", RUPTURE: "red" },
    labelMap: { EN_STOCK: "En stock", FAIBLE: "Faible", RUPTURE: "Rupture" },
  },
];

const EXPORT_COLUMNS: ModuleConfig["exportColumns"] = [
  { key: "sku", label: "SKU" },
  { key: "title", label: "Produit" },
  { key: "inventoryQty", label: "Quantité" },
  { key: "stockState", label: "État" },
];

/** A Stock module variant, optionally scoped to in-stock or out-of-stock. */
function makeStockConfig(
  key: string,
  title: string,
  baseWhere?: Record<string, unknown>
): ModuleConfig {
  return {
    key,
    model: "variant",
    title,
    subtitle: "Disponibilité, ruptures et réapprovisionnement.",
    columns: COLUMNS,
    searchFields: ["sku", "title"],
    filters: [],
    // Default order: best-sellers first (see modules/stock/list.ts). `sold30` is a
    // virtual column, so this never matches an explicit column click.
    defaultSort: { field: "sold30", dir: "desc" },
    exportColumns: EXPORT_COLUMNS,
    ...(baseWhere ? { baseWhere } : {}),
  };
}

/** All variants (kept for back-compat / other callers). */
export const stockConfig = makeStockConfig("stock", "Stock");

/** In-stock products — anything not marked Rupture. */
export const stockAvailableConfig = makeStockConfig(
  "stock_available",
  "Disponible",
  { stockState: { not: "RUPTURE" } }
);

/** Out-of-stock products only. */
export const stockRuptureConfig = makeStockConfig("stock_rupture", "Rupture", {
  stockState: "RUPTURE",
});
