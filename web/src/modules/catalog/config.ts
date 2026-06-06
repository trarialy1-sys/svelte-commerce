import type { ModuleConfig } from "@/lib/module/types";

export const catalogConfig: ModuleConfig = {
  key: "catalog",
  model: "variant",
  title: "Catalogue",
  subtitle: "Produits et variantes synchronisés depuis Shopify.",
  columns: [
    { key: "sku", label: "SKU", type: "mono", sortable: true },
    { key: "title", label: "Produit", type: "text", sortable: true },
    { key: "price", label: "Prix", type: "money", align: "right", sortable: true },
    {
      key: "inventoryQty",
      label: "Stock",
      type: "number",
      align: "right",
      sortable: true,
    },
    {
      key: "status",
      label: "Statut",
      type: "badge",
      badgeMap: { active: "green", archived: "neutral", draft: "amber" },
      labelMap: { active: "Actif", archived: "Archivé", draft: "Brouillon" },
    },
  ],
  searchFields: ["sku", "title"],
  filters: [
    {
      kind: "select",
      key: "status",
      label: "Statut",
      options: [
        { value: "active", label: "Actif" },
        { value: "archived", label: "Archivé" },
        { value: "draft", label: "Brouillon" },
      ],
    },
  ],
  defaultSort: { field: "sku", dir: "asc" },
  exportColumns: [
    { key: "sku", label: "SKU" },
    { key: "title", label: "Produit" },
    { key: "price", label: "Prix" },
    { key: "inventoryQty", label: "Stock" },
    { key: "status", label: "Statut" },
  ],
};
