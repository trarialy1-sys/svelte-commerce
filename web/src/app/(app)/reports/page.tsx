import { requireOrgRole } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org/settings";
import { resolveReportPeriod } from "@/lib/reports/period";
import { getPerformanceReport } from "@/lib/reports/performance";
import { PageHeader } from "@/components/page-header";
import { ReportsControls } from "./reports-controls";
import { PerformanceView } from "./performance-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Whole Reports section is owner/admin (money/strategy-heavy).
  const { orgId } = await requireOrgRole("admin");
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { currency, timezone } = await getOrgSettings(orgId!);
  const period = resolveReportPeriod(timezone, {
    period: str(sp.period),
    from: str(sp.from),
    to: str(sp.to),
  });
  const report = await getPerformanceReport(orgId!, period);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Rapports" subtitle={`Performance — ${period.label}`} />
      <ReportsControls
        reportKey="performance"
        period={{
          kind: period.kind,
          label: period.label,
          fromStr: period.fromStr,
          toStr: period.toStr,
        }}
      />
      <PerformanceView report={report} currency={currency} />
    </div>
  );
}
