import { requireOrgRole } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org/settings";
import { resolveReportPeriod } from "@/lib/reports/period";
import { getProductReport, type ProductRow } from "@/lib/reports/breakdowns";
import { formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ReportsControls } from "../reports-controls";
import { BreakdownView, type BreakdownColumn } from "../breakdown-view";

export const dynamic = "force-dynamic";

export default async function ProduitsReportPage({
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
  const rows = await getProductReport(orgId!, period);
  const money = (n: number) => formatMoney(n, currency);

  const columns: BreakdownColumn<ProductRow>[] = [
    { key: "sku", label: "SKU", format: (r) => r.sku },
    { key: "title", label: "Produit", format: (r) => r.title ?? "—" },
    { key: "orders", label: "Commandes", numeric: true, total: true, format: (r) => formatNumber(r.orders) },
    { key: "units", label: "Unités", numeric: true, total: true, format: (r) => formatNumber(r.units) },
    { key: "revenue", label: "Chiffre", numeric: true, total: true, format: (r) => money(r.revenue) },
    { key: "delivered", label: "Livré", numeric: true, total: true, format: (r) => formatNumber(r.delivered) },
    { key: "returnRate", label: "Taux retour", numeric: true, format: (r) => `${r.returnRate}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Rapports" subtitle={`Par produit — ${period.label}`} />
      <ReportsControls
        reportKey="produits"
        period={{
          kind: period.kind,
          label: period.label,
          fromStr: period.fromStr,
          toStr: period.toStr,
        }}
      />
      <BreakdownView
        title="Performance par produit"
        rows={rows}
        columns={columns}
        defaultSort="revenue"
        rowKey={(r) => r.sku}
      />
    </div>
  );
}
