/** Client-safe import types + the target-field catalogue per entity. */

export type ImportEntity = "orders" | "customers" | "products";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
}

export const ENTITY_FIELDS: Record<
  ImportEntity,
  { label: string; key: string; fields: FieldDef[] }
> = {
  customers: {
    label: "Clients",
    key: "phone",
    fields: [
      { key: "name", label: "Nom" },
      { key: "phone", label: "Téléphone", required: true, hint: "clé d'unicité" },
      { key: "city", label: "Ville" },
      { key: "tags", label: "Tags", hint: "séparés par des virgules" },
    ],
  },
  products: {
    label: "Produits",
    key: "sku",
    fields: [
      { key: "sku", label: "SKU", required: true, hint: "clé d'unicité" },
      { key: "title", label: "Nom du produit" },
      { key: "price", label: "Prix" },
      { key: "inventoryQty", label: "Stock" },
      { key: "cost", label: "Coût" },
      { key: "category", label: "Catégorie" },
    ],
  },
  orders: {
    label: "Commandes",
    key: "code",
    fields: [
      { key: "code", label: "Référence", required: true, hint: "clé d'unicité" },
      { key: "customerName", label: "Client" },
      { key: "phone", label: "Téléphone", required: true },
      { key: "city", label: "Ville" },
      { key: "address", label: "Adresse" },
      { key: "totalPrice", label: "Total / Prix" },
      { key: "sku", label: "SKU(s)", hint: "un ou plusieurs, séparés/collés" },
      { key: "note", label: "Note" },
    ],
  },
};

export type MappedRow = Record<string, string>;

export interface RowError {
  row: number; // 1-based
  messages: string[];
}

export interface DryRunResult {
  total: number;
  toCreate: number;
  toUpdate: number;
  errorCount: number;
  errors: RowError[];
}

export interface CommitResult {
  created: number;
  updated: number;
  failed: number;
  errors: RowError[];
}
