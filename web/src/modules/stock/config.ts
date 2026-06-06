import type { ModuleConfig } from "@/lib/module/types";

export const stockConfig: ModuleConfig = {
  key: "stock",
  model: "variant",
  title: "Stock",
  subtitle: "Disponibilité, ruptures et réapprovisionnement.",
  columns: [
    { key: "sku", label: "SKU", type: "mono", sortable: true },
    { key: "title", label: "Produit", type: "text", sortable: true },
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
  ],
  searchFields: ["sku", "title"],
  filters: [
    {
      kind: "select",
      key: "stockState",
      label: "État",
      options: [
        { value: "RUPTURE", label: "Rupture" },
        { value: "FAIBLE", label: "Faible" },
        { value: "EN_STOCK", label: "En stock" },
      ],
    },
  ],
  defaultSort: { field: "inventoryQty", dir: "asc" },
  exportColumns: [
    { key: "sku", label: "SKU" },
    { key: "title", label: "Produit" },
    { key: "inventoryQty", label: "Quantité" },
    { key: "stockState", label: "État" },
  ],
};
