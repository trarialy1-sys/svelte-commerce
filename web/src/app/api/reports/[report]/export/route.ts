import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { getAuthContext } from "@/lib/auth";
import { meetsOrgRole } from "@/lib/auth/roles";
import { getOrgSettings } from "@/lib/org/settings";
import { resolveReportPeriod } from "@/lib/reports/period";
import { getPerformanceReport } from "@/lib/reports/performance";
import { getCityReport, getProductReport } from "@/lib/reports/breakdowns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Cell = string | number;

function csvEscape(v: Cell): string {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build the (header, rows) matrix for a report over the resolved period. */
async function buildMatrix(
  report: string,
  orgId: string,
  sp: URLSearchParams,
  tz: string
): Promise<{ header: string[]; rows: Cell[][]; sheet: string } | null> {
  const period = resolveReportPeriod(tz, {
    period: sp.get("period") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });

  if (report === "performance") {
    const r = await getPerformanceReport(orgId, period);
    return {
      sheet: "Performance",
      header: ["Période", "Commandes", "Livré", "Retours", "COD créé", "COD livré", "Versé"],
      rows: r.buckets.map((b) => [
        b.date,
        b.orders,
        b.delivered,
        b.returned,
        b.codCree,
        b.codLivre,
        b.verse,
      ]),
    };
  }

  if (report === "villes") {
    const rows = await getCityReport(orgId, period);
    return {
      sheet: "Par ville",
      header: ["Ville", "Commandes", "Livré", "Retours", "Taux retour %", "COD livré"],
      rows: rows.map((r) => [r.city, r.orders, r.delivered, r.returned, r.returnRate, r.codLivre]),
    };
  }

  if (report === "produits") {
    const rows = await getProductReport(orgId, period);
    return {
      sheet: "Par produit",
      header: ["SKU", "Produit", "Commandes", "Unités", "Chiffre", "Livré", "Retours", "Taux retour %"],
      rows: rows.map((r) => [
        r.sku,
        r.title ?? "",
        r.orders,
        r.units,
        r.revenue,
        r.delivered,
        r.returned,
        r.returnRate,
      ]),
    };
  }

  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ report: string }> }
) {
  const { report } = await params;

  const { userId, orgId, appRole } = await getAuthContext();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });
  // Reports section is owner/admin only.
  if (!meetsOrgRole(appRole, "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { timezone } = await getOrgSettings(orgId);
  const built = await buildMatrix(report, orgId, req.nextUrl.searchParams, timezone);
  if (!built) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  const { header, rows, sheet } = built;
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `rapport-${report}-${date}.${format}`;

  if (format === "csv") {
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
