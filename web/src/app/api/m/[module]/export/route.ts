import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { getAuthContext } from "@/lib/auth";
import { getModule } from "@/lib/module/registry";
import { exportRows, parseListParams } from "@/lib/module/query";
import { formatDateISO } from "@/lib/format";
import type { ExportColumn, ModuleConfig, Row } from "@/lib/module/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function valueFor(
  config: ModuleConfig,
  col: ExportColumn,
  row: Row
): string | number {
  if (col.map) return col.map(row);
  const raw = row[col.key];
  if (raw == null) return "";
  const column = config.columns.find((c) => c.key === col.key);
  switch (column?.type) {
    case "date":
      return formatDateISO(raw as string | Date);
    case "money":
    case "number":
      return Number(raw as string | number);
    default:
      return String(raw);
  }
}

function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ module: string }> }
) {
  const { module } = await params;
  const entry = getModule(module);
  if (!entry) {
    return NextResponse.json({ error: "Unknown module" }, { status: 404 });
  }

  const { userId, orgId } = await getAuthContext();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  const listParams = parseListParams(req.nextUrl.searchParams, entry.config);
  const rows = await exportRows(orgId, entry.config, listParams);

  const cols: ExportColumn[] =
    entry.config.exportColumns ??
    entry.config.columns.map((c) => ({ key: c.key, label: c.label }));
  const header = cols.map((c) => c.label);
  const matrix = rows.map((r) => cols.map((c) => valueFor(entry.config, c, r)));

  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${module}-${date}.${format}`;

  if (format === "csv") {
    const csv = [header, ...matrix]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");
    // BOM so Excel reads UTF-8 correctly.
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const ws = XLSX.utils.aoa_to_sheet([header, ...matrix]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entry.config.title.slice(0, 31) || "Export");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
