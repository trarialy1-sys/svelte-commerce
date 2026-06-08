"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface BreakdownColumn<T> {
  key: keyof T & string;
  label: string;
  /** Right-align + tabular nums + sort numerically. */
  numeric?: boolean;
  format?: (row: T) => string;
  /** Sum into a footer total row. */
  total?: boolean;
}

export function BreakdownView<T extends object>({
  title,
  rows,
  columns,
  defaultSort,
  rowKey,
  emptyLabel = "Aucune donnée sur la période.",
}: {
  title: string;
  rows: T[];
  columns: BreakdownColumn<T>[];
  defaultSort: keyof T & string;
  rowKey: (row: T) => string;
  emptyLabel?: string;
}) {
  const [sortKey, setSortKey] = React.useState<keyof T & string>(defaultSort);
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const onSort = (key: keyof T & string, numeric?: boolean) => {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(numeric ? "desc" : "asc");
    }
  };

  const totals = React.useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of columns) {
      if (c.total) {
        acc[c.key] = rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0);
      }
    }
    return acc;
  }, [rows, columns]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => {
                  const active = c.key === sortKey;
                  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <TableHead
                      key={c.key}
                      className={cn(c.numeric && "text-right")}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(c.key, c.numeric)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          c.numeric && "flex-row-reverse",
                          active ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        <Icon className="size-3" />
                        {c.label}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-muted-foreground py-6 text-center">
                    {emptyLabel}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((r) => (
                  <TableRow key={rowKey(r)}>
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(c.numeric && "text-right tabular-nums")}
                      >
                        {c.format ? c.format(r) : String(r[c.key] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
            {sorted.length > 0 && Object.keys(totals).length > 0 ? (
              <TableFooter>
                <TableRow>
                  {columns.map((c, i) => (
                    <TableCell
                      key={c.key}
                      className={cn(c.numeric && "text-right tabular-nums", "font-semibold")}
                    >
                      {i === 0
                        ? "Total"
                        : c.total
                          ? (c.format
                              ? c.format({ ...({} as T), [c.key]: totals[c.key] } as T)
                              : String(totals[c.key] ?? ""))
                          : ""}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
