import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma/client";

export type Row = Record<string, unknown>;

export type ColumnType =
  | "text"
  | "mono"
  | "money"
  | "date"
  | "datetime"
  | "number"
  | "badge"
  | "who"
  | "custom";

export interface Column {
  key: string;
  label: string;
  type: ColumnType;
  sortable?: boolean;
  align?: "left" | "right";
  /** status value -> StatusBadge tone (green/amber/blue/violet/red/neutral) */
  badgeMap?: Record<string, string>;
  /** status value -> human label (for badge columns) */
  labelMap?: Record<string, string>;
  /** for type 'custom' (client-rendered) */
  render?: (row: Row) => ReactNode;
}

export type Filter =
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
    }
  | { kind: "dateRange"; key: string; label: string }
  | { kind: "boolean"; key: string; label: string };

export interface RowAction {
  label: string;
  href?: (row: Row) => string;
  action?: string;
  minRole?: Role;
}

export interface BulkAction {
  key: string;
  label: string;
  minRole?: Role;
  destructive?: boolean;
}

export interface ExportColumn {
  key: string;
  label: string;
  map?: (row: Row) => string | number;
}

export interface ModuleConfig {
  /** route/registry key, e.g. 'customers' */
  key: string;
  /** Prisma model name, e.g. 'customer' */
  model: string;
  title: string;
  subtitle?: string;
  /** Minimum role required to list/export this module (enforced in the API). */
  minRole?: Role;
  columns: Column[];
  /** case-insensitive `contains` OR-match */
  searchFields: string[];
  filters: Filter[];
  defaultSort: { field: string; dir: "asc" | "desc" };
  rowActions?: RowAction[];
  bulkActions?: BulkAction[];
  exportColumns?: ExportColumn[];
  /** optional fixed scoping (e.g. a status subset) */
  baseWhere?: Record<string, unknown>;
  /** optional Prisma `include` for relations (read with dot-path column keys) */
  include?: Record<string, unknown>;
}

export interface ListParams {
  page: number;
  pageSize: number;
  q: string;
  sortField: string;
  sortDir: "asc" | "desc";
  /** raw filter values keyed by filter key (dateRange uses `${key}_from`/`_to`) */
  filters: Record<string, string>;
}

export interface ListResult<T = Row> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
