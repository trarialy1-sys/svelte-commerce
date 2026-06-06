import type { Column, ExportColumn, Filter, ModuleConfig } from "@/lib/module/types";

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

const SOURCE_TONES: Record<string, string> = {
  SHOPIFY: "violet",
  IMPORT: "blue",
  MANUAL: "neutral",
};

const COLUMNS: Column[] = [
  { key: "code", label: "Référence", type: "mono", sortable: true },
  { key: "customer.name", label: "Client", type: "who" },
  { key: "phone", label: "Téléphone", type: "mono" },
  { key: "cityRaw", label: "Ville", type: "text" },
  {
    key: "itemsCount",
    label: "Articles",
    type: "number",
    align: "right",
    sortable: true,
  },
  {
    key: "totalPrice",
    label: "Total",
    type: "money",
    align: "right",
    sortable: true,
  },
  {
    key: "status",
    label: "Statut",
    type: "badge",
    badgeMap: STATUS_TONES,
    labelMap: STATUS_LABELS,
  },
  {
    key: "source",
    label: "Source",
    type: "badge",
    badgeMap: SOURCE_TONES,
    labelMap: SOURCE_LABELS,
  },
  { key: "createdAt", label: "Créée le", type: "date", sortable: true },
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
  { key: "code", label: "Référence" },
  { key: "customer.name", label: "Client" },
  { key: "phone", label: "Téléphone" },
  { key: "cityRaw", label: "Ville" },
  { key: "itemsCount", label: "Articles" },
  { key: "totalPrice", label: "Total" },
  { key: "status", label: "Statut" },
  { key: "source", label: "Source" },
  { key: "createdAt", label: "Créée le" },
];

const INCLUDE = { customer: { select: { name: true } } };

/** Build an Orders module config variant (shared columns, optional scoping). */
function makeOrdersConfig(
  key: string,
  title: string,
  opts: {
    subtitle?: string;
    baseWhere?: Record<string, unknown>;
    bulkActions?: ModuleConfig["bulkActions"];
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
    defaultSort: { field: "createdAt", dir: "desc" },
    exportColumns: EXPORT_COLUMNS,
    include: INCLUDE,
    ...(opts.baseWhere ? { baseWhere: opts.baseWhere } : {}),
    ...(opts.bulkActions ? { bulkActions: opts.bulkActions } : {}),
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

/** "Prêtes" — confirmed orders not yet shipped (no parcel). */
export const ordersReadyConfig = makeOrdersConfig("orders_ready", "Prêtes", {
  subtitle: "Commandes confirmées, prêtes à expédier.",
  baseWhere: { status: "CONFIRMEE", parcel: { is: null } },
});

export { STATUS_LABELS, STATUS_TONES, SOURCE_LABELS };
