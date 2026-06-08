"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Download,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { Column, ListResult, ModuleConfig, Row } from "@/lib/module/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DEFAULT_PAGE_SIZE = 25;

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Read a possibly-dotted key (e.g. "customer.name") from a row. */
function getNested(row: Row, key: string): unknown {
  if (!key.includes(".")) return row[key];
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Row)[part];
    return undefined;
  }, row);
}

function Cell({ column, row }: { column: Column; row: Row }) {
  const value = getNested(row, column.key);
  switch (column.type) {
    case "mono":
      return <span className="font-mono text-sm">{String(value ?? "—")}</span>;
    case "money":
      return <span className="font-mono tabular-nums">{formatMoney(value as number | string)}</span>;
    case "number":
      return <span className="font-mono tabular-nums">{formatNumber(value as number)}</span>;
    case "date":
      return <span className="text-muted-foreground">{formatDate(value as string)}</span>;
    case "datetime":
      return <span className="text-muted-foreground">{formatDateTime(value as string)}</span>;
    case "badge": {
      const v = String(value ?? "");
      const tone = column.badgeMap?.[v];
      const label =
        column.labelMap?.[v] ?? v.charAt(0) + v.slice(1).toLowerCase();
      return <StatusBadge status={v} tone={tone as never} label={label} />;
    }
    case "tags": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      if (arr.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {arr.map((t) => (
            <span
              key={t}
              className="bg-accent text-accent-foreground rounded px-1.5 py-0.5 text-xs"
            >
              {t}
            </span>
          ))}
        </div>
      );
    }
    case "bool": {
      if (!value) return <span className="text-muted-foreground">—</span>;
      const tone = column.badgeMap?.["true"] ?? "red";
      const label = column.labelMap?.["true"] ?? column.label;
      return <StatusBadge status="true" tone={tone as never} label={label} />;
    }
    case "who":
      return (
        <div className="flex items-center gap-2">
          <span className="bg-accent text-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold">
            {initials(String(value ?? "?"))}
          </span>
          <span className="font-medium">{String(value ?? "—")}</span>
        </div>
      );
    case "custom":
      return <>{column.render?.(row)}</>;
    default:
      return <span>{String(value ?? "—")}</span>;
  }
}

interface DataTableProps {
  config: ModuleConfig;
  role: AppRole | null;
  /** Tool-specific bulk controls rendered in the selection bar (e.g. restock). */
  renderBulkExtra?: (ids: string[], clear: () => void) => React.ReactNode;
  /** Open a detail view when a row is clicked. */
  onRowClick?: (row: Row) => void;
  /** Per-row controls rendered in a trailing actions column. */
  renderRowActions?: (row: Row) => React.ReactNode;
  /** Compact, spreadsheet-style rows (tighter padding, smaller text). */
  dense?: boolean;
}

export function DataTable({
  config,
  role,
  renderBulkExtra,
  onRowClick,
  renderRowActions,
  dense,
}: DataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const paramsString = searchParams.toString();

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const sortRaw = searchParams.get("sort") ?? "";
  const [sortField, sortDir] = sortRaw
    ? sortRaw.split(":")
    : [config.defaultSort.field, config.defaultSort.dir];

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = React.useState(searchParams.get("q") ?? "");
  // Destructive bulk actions confirm before firing.
  const [confirmAction, setConfirmAction] = React.useState<
    NonNullable<ModuleConfig["bulkActions"]>[number] | null
  >(null);

  // Push URL updates (resets to page 1 unless told otherwise).
  const setParams = React.useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const sp = new URLSearchParams(paramsString);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      if (resetPage) sp.delete("page");
      router.push(`${pathname}?${sp.toString()}`);
    },
    [paramsString, pathname, router]
  );

  // Debounced search → URL.
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (searchInput === current) return;
    const t = setTimeout(() => setParams({ q: searchInput || null }), 350);
    return () => clearTimeout(t);
  }, [searchInput, searchParams, setParams]);

  const { data, isPending, isError } = useQuery<ListResult>({
    queryKey: [config.key, paramsString],
    queryFn: async () => {
      const res = await fetch(`/api/m/${config.key}?${paramsString}`);
      if (!res.ok) throw new Error("Échec du chargement");
      return res.json();
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Selection persists across pagination/filtering; it's cleared after a bulk
  // action succeeds or via the clear button.
  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selected.has(String(r.id)));

  const toggleAll = () => {
    setSelected(
      allOnPageSelected ? new Set() : new Set(rows.map((r) => String(r.id)))
    );
  };
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: string) => {
    if (sortField === key) {
      setParams({ sort: `${key}:${sortDir === "asc" ? "desc" : "asc"}` }, false);
    } else {
      setParams({ sort: `${key}:asc` }, false);
    }
  };

  const bulkMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch(`/api/m/${config.key}/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      if (!res.ok) {
        const msg =
          res.status === 403 ? "Action non autorisée" : "Échec de l'action";
        throw new Error(msg);
      }
      return (await res.json()) as { updated: number };
    },
    onSuccess: (result) => {
      toast.success(`${result.updated} élément(s) mis à jour`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: [config.key] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const visibleBulkActions = (config.bulkActions ?? []).filter(
    (a) => !a.minRole || meetsOrgRole(role, a.minRole.toLowerCase() as AppRole)
  );
  const hasSelection = visibleBulkActions.length > 0 || Boolean(renderBulkExtra);
  const colSpan =
    config.columns.length +
    (hasSelection ? 1 : 0) +
    (renderRowActions ? 1 : 0);

  const exportHref = (format: "csv" | "xlsx") => {
    const sp = new URLSearchParams(paramsString);
    sp.set("format", format);
    return `/api/m/${config.key}/export?${sp.toString()}`;
  };

  const activeFilterCount = config.filters.filter((f) =>
    f.kind === "dateRange"
      ? searchParams.get(`${f.key}_from`) || searchParams.get(`${f.key}_to`)
      : searchParams.get(f.key)
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Rechercher…"
            className="pl-8"
          />
        </div>

        {config.filters.map((filter) => {
          if (filter.kind === "select") {
            const current = searchParams.get(filter.key) ?? "all";
            return (
              <Select
                key={filter.key}
                value={current}
                onValueChange={(v) =>
                  setParams({ [filter.key]: v === "all" ? null : v })
                }
              >
                <SelectTrigger size="sm" className="w-[150px]">
                  <SelectValue placeholder={filter.label} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{filter.label} : tous</SelectItem>
                  {filter.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
          if (filter.kind === "dateRange") {
            return (
              <div key={filter.key} className="flex items-center gap-1">
                <Input
                  type="date"
                  aria-label={`${filter.label} (début)`}
                  value={searchParams.get(`${filter.key}_from`) ?? ""}
                  onChange={(e) =>
                    setParams({ [`${filter.key}_from`]: e.target.value || null })
                  }
                  className="h-8 w-[140px]"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <Input
                  type="date"
                  aria-label={`${filter.label} (fin)`}
                  value={searchParams.get(`${filter.key}_to`) ?? ""}
                  onChange={(e) =>
                    setParams({ [`${filter.key}_to`]: e.target.value || null })
                  }
                  className="h-8 w-[140px]"
                />
              </div>
            );
          }
          return null;
        })}

        {activeFilterCount > 0 || searchParams.get("q") ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("");
              router.push(pathname);
            }}
          >
            <X className="size-4" />
            Réinitialiser
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={exportHref("csv")}>
              <Download className="size-4" />
              CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={exportHref("xlsx")}>
              <Download className="size-4" />
              Excel
            </a>
          </Button>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && hasSelection ? (
        <div className="bg-accent/60 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} sélectionné(s)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {renderBulkExtra?.(Array.from(selected), () => setSelected(new Set()))}
            {visibleBulkActions.map((a) => (
              <Button
                key={a.key}
                size="sm"
                variant={a.destructive ? "destructive" : "default"}
                disabled={bulkMutation.isPending}
                onClick={() =>
                  a.destructive ? setConfirmAction(a) : bulkMutation.mutate(a.key)
                }
              >
                {bulkMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {a.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Destructive-action confirmation */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.label}</DialogTitle>
            <DialogDescription>
              {confirmAction
                ? `${confirmAction.label} ${selected.size} élément(s) ? Cette action est irréversible.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={bulkMutation.isPending}
              onClick={() => {
                const key = confirmAction?.key;
                setConfirmAction(null);
                if (key) bulkMutation.mutate(key);
              }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {hasSelection ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
              ) : null}
              {config.columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    dense && "h-9 text-xs",
                    col.align === "right" && "text-right"
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        "hover:text-foreground inline-flex items-center gap-1",
                        col.align === "right" && "flex-row-reverse"
                      )}
                    >
                      {col.label}
                      {sortField === col.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
              {renderRowActions ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {hasSelection ? (
                    <TableCell>
                      <Skeleton className="size-4" />
                    </TableCell>
                  ) : null}
                  {config.columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                  {renderRowActions ? (
                    <TableCell>
                      <Skeleton className="size-4" />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="text-destructive py-10 text-center"
                >
                  Échec du chargement des données.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="p-0">
                  <EmptyState
                    title="Aucun résultat"
                    message="Aucun élément ne correspond à vos critères."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const id = String(row.id);
                return (
                  <TableRow
                    key={id}
                    data-state={selected.has(id) ? "selected" : undefined}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {hasSelection ? (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(id)}
                          onCheckedChange={() => toggleRow(id)}
                          aria-label="Sélectionner la ligne"
                        />
                      </TableCell>
                    ) : null}
                    {config.columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          dense && "py-1.5 text-xs",
                          col.align === "right" && "text-right"
                        )}
                      >
                        <Cell column={col} row={row} />
                      </TableCell>
                    ))}
                    {renderRowActions ? (
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderRowActions(row)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {formatNumber(total)} élément(s) · page {page}/{totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setParams({ page: String(page - 1) }, false)}
          >
            Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setParams({ page: String(page + 1) }, false)}
          >
            Suivant
          </Button>
        </div>
      </div>
    </div>
  );
}
