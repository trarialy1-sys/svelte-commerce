import type { Column, ExportColumn, Filter, ModuleConfig } from "@/lib/module/types";

const RETURN_TONES: Record<string, string> = {
  none: "neutral",
  ok: "green",
  probleme: "red",
};
const RETURN_LABELS: Record<string, string> = {
  none: "Aucun",
  ok: "Fiable",
  probleme: "Problème",
};

const COLUMNS: Column[] = [
  { key: "name", label: "Nom", type: "who", sortable: true },
  { key: "phoneDisplay", label: "Téléphone", type: "mono" },
  { key: "city", label: "Ville", type: "text", sortable: true },
  {
    key: "ordersCount",
    label: "Commandes",
    type: "number",
    align: "right",
    sortable: true,
  },
  { key: "lastOrderAt", label: "Dernière commande", type: "date", sortable: true },
  {
    key: "returnState",
    label: "Retours",
    type: "badge",
    badgeMap: RETURN_TONES,
    labelMap: RETURN_LABELS,
  },
  { key: "tags", label: "Tags", type: "tags" },
  {
    key: "isBlocked",
    label: "Bloqué",
    type: "bool",
    badgeMap: { true: "red" },
    labelMap: { true: "Bloqué" },
  },
  // COD money — owner/admin only (the page strips this column for others, and
  // the list endpoint omits the value).
  { key: "codDelivered", label: "COD livré", type: "money", align: "right" },
];

const FILTERS: Filter[] = [
  { kind: "boolean", key: "blocked", label: "Bloqué" },
  { kind: "boolean", key: "hasReturns", label: "A des retours" },
  // Options are injected per-request by the page (distinct cities / tags).
  { kind: "select", key: "city", label: "Ville", options: [] },
  { kind: "select", key: "tag", label: "Tag", options: [] },
];

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "name", label: "Nom" },
  { key: "phoneDisplay", label: "Téléphone" },
  { key: "city", label: "Ville" },
  { key: "ordersCount", label: "Commandes" },
  { key: "lastOrderAt", label: "Dernière commande" },
  { key: "returnState", label: "Retours" },
  { key: "tags", label: "Tags" },
  { key: "isBlocked", label: "Bloqué" },
];

/**
 * Clients (CRM) list config. The list/export run through custom handlers in the
 * registry (COD-aware aggregates), not the generic query — but the columns,
 * filters and search still drive the shared <DataTable> UI and param parsing.
 */
export const customersConfig: ModuleConfig = {
  key: "customers",
  model: "customer",
  title: "Clients",
  subtitle: "Fiabilité COD, historique et notes.",
  columns: COLUMNS,
  searchFields: ["name", "phone", "city"],
  filters: FILTERS,
  defaultSort: { field: "lastOrderAt", dir: "desc" },
  bulkActions: [
    { key: "delete", label: "Supprimer", minRole: "OPERATOR", destructive: true },
  ],
  exportColumns: EXPORT_COLUMNS,
};
