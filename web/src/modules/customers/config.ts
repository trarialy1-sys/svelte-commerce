import type { ModuleConfig } from "@/lib/module/types";

/**
 * Demo module config — the reference implementation of the framework.
 * Pure data (no functions) so it can cross the server/client boundary.
 * Real CRM logic arrives in Chunk 2.1.
 */
export const customersConfig: ModuleConfig = {
  key: "customers",
  model: "customer",
  title: "Clients",
  subtitle: "Base clients et segments.",
  columns: [
    { key: "name", label: "Nom", type: "who", sortable: true },
    { key: "phone", label: "Téléphone", type: "mono" },
    { key: "city", label: "Ville", type: "text", sortable: true },
    {
      key: "segment",
      label: "Segment",
      type: "badge",
      badgeMap: { NOUVEAU: "blue", RECURRENT: "green", VIP: "violet" },
    },
    {
      key: "ordersCount",
      label: "Commandes",
      type: "number",
      align: "right",
      sortable: true,
    },
    {
      key: "totalSpent",
      label: "Total dépensé",
      type: "money",
      align: "right",
      sortable: true,
    },
    { key: "createdAt", label: "Créé le", type: "date", sortable: true },
  ],
  searchFields: ["name", "phone", "city"],
  filters: [
    {
      kind: "select",
      key: "segment",
      label: "Segment",
      options: [
        { value: "NOUVEAU", label: "Nouveau" },
        { value: "RECURRENT", label: "Récurrent" },
        { value: "VIP", label: "VIP" },
      ],
    },
    { kind: "dateRange", key: "createdAt", label: "Date de création" },
  ],
  defaultSort: { field: "createdAt", dir: "desc" },
  bulkActions: [{ key: "mark_vip", label: "Marquer VIP", minRole: "ADMIN" }],
  exportColumns: [
    { key: "name", label: "Nom" },
    { key: "phone", label: "Téléphone" },
    { key: "city", label: "Ville" },
    { key: "segment", label: "Segment" },
    { key: "ordersCount", label: "Commandes" },
    { key: "totalSpent", label: "Total dépensé" },
    { key: "createdAt", label: "Créé le" },
  ],
};
