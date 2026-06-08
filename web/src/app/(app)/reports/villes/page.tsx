import { requireOrgRole } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org/settings";
import { resolveReportPeriod } from "@/lib/reports/period";
import { getCityReport, type CityRow } from "@/lib/reports/breakdowns";
import { formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ReportsControls } from "../reports-controls";
import { BreakdownView, type BreakdownColumn } from "../breakdown-view";

export const dynamic = "force-dynamic";

export default async function VillesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await requireOrgRole("admin");
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { currency, timezone } = await getOrgSettings(orgId!);
  const period = resolveReportPeriod(timezone, {
    period: str(sp.period),
    from: str(sp.from),
    to: str(sp.to),
  });
  const rows = await getCityReport(orgId!, period);
  const money = (n: number) => formatMoney(n, currency);

  const columns: BreakdownColumn<CityRow>[] = [
    { key: "city", label: "Ville" },
    { key: "orders", label: "Commandes", numeric: true, total: true, format: (r) => formatNumber(r.orders) },
    { key: "delivered", label: "Livré", numeric: true, total: true, format: (r) => formatNumber(r.delivered) },
    { key: "returned", label: "Retours", numeric: true, total: true, format: (r) => formatNumber(r.returned) },
    { key: "returnRate", label: "Taux retour", numeric: true, format: (r) => `${r.returnRate}%` },
    { key: "codLivre", label: "COD livré", numeric: true, total: true, format: (r) => money(r.codLivre) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Rapports" subtitle={`Par ville — ${period.label}`} />
      <ReportsControls
        reportKey="villes"
        period={{
          kind: period.kind,
          label: period.label,
          fromStr: period.fromStr,
          toStr: period.toStr,
        }}
      />
      <BreakdownView
        title="Performance par ville"
        rows={rows}
        columns={columns}
        defaultSort="orders"
        rowKey={(r) => (r.cityId == null ? "none" : String(r.cityId))}
      />
    </div>
  );
}
