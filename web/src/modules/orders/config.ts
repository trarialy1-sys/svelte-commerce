import type {
  Column,
  ExportColumn,
  Filter,
  ModuleConfig,
  Row,
} from "@/lib/module/types";

/** First-item helpers for the Produit / Code suivi columns (read order items). */
interface OrderItemLite {
  title?: string | null;
  sku?: string | null;
}
function orderItems(row: Row): OrderItemLite[] {
  return ((row as { items?: OrderItemLite[] }).items ?? []) as OrderItemLite[];
}
function productCell(row: Row): string {
  const items = orderItems(row);
  if (items.length === 0) return "—";
  const first = items[0];
  const extra = items.length > 1 ? ` +${items.length - 1}` : "";
  return (first.title || first.sku || "—") + extra;
}
function skuCell(row: Row): string {
  return orderItems(row)[0]?.sku || "—";
}


const STATUS_LABELS: Record<string, string> = {
  NOUVELLE: "Nouvelle",
  CONFIRMEE: "Confirmée",
  ANNULEE: "Annulée",
  REPORTEE: "Reportée",
  PAS_DE_REPONSE: "Pas de réponse",
  INJOIGNABLE: "Injoignable",
  NUMERO_ERRONE: "Numéro erroné",
  DOUBLON: "Doublon",
  HORS_ZONE: "Hors zone",
};

const STATUS_TONES: Record<string, string> = {
  NOUVELLE: "blue",
  CONFIRMEE: "green",
  ANNULEE: "red",
  REPORTEE: "amber",
  PAS_DE_REPONSE: "amber",
  INJOIGNABLE: "amber",
  NUMERO_ERRONE: "red",
  DOUBLON: "violet",
  HORS_ZONE: "neutral",
};

const SOURCE_LABELS: Record<string, string> = {
  SHOPIFY: "Shopify",
  IMPORT: "Import",
  MANUAL: "Manuel",
};

const COLUMNS: Column[] = [
  { key: "createdAt", label: "Date", type: "date", sortable: true },
  { key: "code", label: "N°", type: "mono", sortable: true },
  {
    key: "product",
    label: "Produit",
    type: "custom",
    render: productCell,
    maxWidth: 240,
  },
  { key: "sku", label: "Code suivi", type: "custom", render: skuCell },
  {
    key: "totalPrice",
    label: "Prix",
    type: "money",
    align: "right",
    sortable: true,
  },
  { key: "customer.name", label: "Destinataire", type: "who" },
  { key: "address", label: "Adresse", type: "text", maxWidth: 200 },
  { key: "phone", label: "Téléphone", type: "mono" },
  { key: "cityRaw", label: "Ville", type: "text" },
  {
    key: "status",
    label: "Statut",
    type: "badge",
    badgeMap: STATUS_TONES,
    labelMap: STATUS_LABELS,
  },
];

const FILTERS: Filter[] = [
  {
    kind: "select",
    key: "status",
    label: "Statut",
    options: Object.entries(STATUS_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  },
  {
    kind: "select",
    key: "source",
    label: "Source",
    options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  },
  { kind: "dateRange", key: "createdAt", label: "Date" },
];

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "createdAt", label: "Date" },
  { key: "code", label: "N°" },
  { key: "customer.name", label: "Destinataire" },
  { key: "address", label: "Adresse" },
  { key: "phone", label: "Téléphone" },
  { key: "cityRaw", label: "Ville" },
  { key: "totalPrice", label: "Prix" },
  { key: "status", label: "Statut" },
  { key: "source", label: "Source" },
];

const INCLUDE = {
  customer: { select: { name: true } },
  items: { select: { title: true, sku: true }, take: 5 },
};

/** Build an Orders module config variant (shared columns, optional scoping). */
function makeOrdersConfig(
  key: string,
  title: string,
  opts: {
    subtitle?: string;
    baseWhere?: Record<string, unknown>;
    bulkActions?: ModuleConfig["bulkActions"];
    defaultSort?: { field: string; dir: "asc" | "desc" };
  } = {}
): ModuleConfig {
  return {
    key,
    model: "order",
    title,
    subtitle: opts.subtitle,
    columns: COLUMNS,
    searchFields: ["code", "phone", "cityRaw"],
    filters: FILTERS,
    defaultSort: opts.defaultSort ?? { field: "createdAt", dir: "desc" },
    exportColumns: EXPORT_COLUMNS,
    include: INCLUDE,
    ...(opts.baseWhere ? { baseWhere: opts.baseWhere } : {}),
    // Every Orders tab gets an admin-only "Supprimer" (after any tab-specific
    // actions). Deleting an order cascades to its items and parcel.
    bulkActions: [
      ...(opts.bulkActions ?? []),
      { key: "delete", label: "Supprimer", minRole: "OPERATOR", destructive: true },
    ],
  };
}

/** "Toutes" — every order. */
export const ordersConfig = makeOrdersConfig("orders", "Commandes", {
  subtitle: "Toutes les commandes, tous statuts confondus.",
});

/** "À confirmer" — orders awaiting a confirmation outcome. */
export const ordersToConfirmConfig = makeOrdersConfig(
  "orders_confirm",
  "À confirmer",
  {
    subtitle: "Commandes en attente d'un appel de confirmation.",
    baseWhere: {
      status: { in: ["NOUVELLE", "REPORTEE", "PAS_DE_REPONSE"] },
    },
    bulkActions: [
      { key: "confirm", label: "Confirmer", minRole: "OPERATOR" },
      {
        key: "cancel",
        label: "Annuler",
        minRole: "OPERATOR",
        destructive: true,
      },
    ],
  }
);

/** "Confirmées" — confirmed orders, grouped by confirmation day in the UI. */
export const ordersConfirmedConfig = makeOrdersConfig(
  "orders_confirmed",
  "Confirmées",
  {
    subtitle: "Commandes confirmées, groupées par jour de confirmation.",
    baseWhere: { status: "CONFIRMEE" },
    defaultSort: { field: "confirmedAt", dir: "desc" },
  }
);

/** "Prêt à expédier" — confirmed orders not yet shipped (no parcel). */
export const ordersReadyConfig = makeOrdersConfig(
  "orders_ready",
  "Prêt à expédier",
  {
    subtitle: "Commandes confirmées, prêtes à expédier.",
    baseWhere: { status: "CONFIRMEE", parcel: { is: null } },
  }
);

export { STATUS_LABELS, STATUS_TONES, SOURCE_LABELS };
