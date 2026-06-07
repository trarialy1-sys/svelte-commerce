import { Role } from "@/generated/prisma/client";
import type { Column, ExportColumn, Filter, ModuleConfig } from "@/lib/module/types";

// Human labels for the common audit actions. Unknown actions fall through to
// their raw code (the badge renders the value as-is), so the trail is never
// lossy as new actions are added.
const ACTION_LABELS: Record<string, string> = {
  "org.updated": "Organisation modifiée",
  "team.member_invited": "Membre invité",
  "team.role_changed": "Rôle modifié",
  "team.member_removed": "Membre retiré",
  "bulk.confirm": "Commandes confirmées",
  "bulk.cancel": "Commandes annulées",
  "order.remake": "Commande refaite",
  "shipping.parcel_created": "Colis créé",
  "shipping.bl_created": "Bon de livraison créé",
  "shipping.alias_learned": "Ville corrigée",
  "shipping.cities_refreshed": "Villes actualisées",
  "stock.rupture": "Mise en rupture",
  "stock.restock": "Réapprovisionnement",
  "catalog.synced": "Catalogue synchronisé",
  "catalog.imported_csv": "Catalogue importé",
  "integration.connected": "Intégration connectée",
  "integration.disconnected": "Intégration déconnectée",
};

const ACTION_TONES: Record<string, string> = {
  "team.member_removed": "red",
  "team.member_invited": "green",
  "team.role_changed": "amber",
  "org.updated": "blue",
};

const COLUMNS: Column[] = [
  { key: "createdAt", label: "Date", type: "datetime", sortable: true },
  { key: "actor.email", label: "Acteur", type: "who" },
  {
    key: "action",
    label: "Action",
    type: "badge",
    badgeMap: ACTION_TONES,
    labelMap: ACTION_LABELS,
  },
  { key: "entity", label: "Entité", type: "text" },
  { key: "entityId", label: "ID", type: "mono" },
];

const FILTERS: Filter[] = [
  { kind: "dateRange", key: "createdAt", label: "Date" },
];

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "createdAt", label: "Date" },
  { key: "actor.email", label: "Acteur" },
  { key: "action", label: "Action" },
  { key: "entity", label: "Entité" },
  { key: "entityId", label: "ID" },
];

/** Audit-log viewer — owner/admin only (enforced in the module API routes). */
export const auditConfig: ModuleConfig = {
  key: "audit",
  model: "auditLog",
  title: "Sécurité & audit",
  subtitle: "Journal des actions de l'organisation.",
  minRole: Role.ADMIN,
  columns: COLUMNS,
  searchFields: ["action", "entity", "entityId"],
  filters: FILTERS,
  defaultSort: { field: "createdAt", dir: "desc" },
  exportColumns: EXPORT_COLUMNS,
  include: { actor: { select: { name: true, email: true } } },
};
