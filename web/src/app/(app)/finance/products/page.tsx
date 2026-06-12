import { requireOrgRole } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org/settings";
import { resolvePeriod } from "@/lib/finance/period";
import { getProductPnl } from "@/lib/finance/product-pnl";
import { ProductPnlView } from "./pnl-view";

export const dynamic = "force-dynamic";

export default async function ProductPnlPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Money — owner/admin only (redirects others).
  const { orgId } = await requireOrgRole("admin");
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { currency, timezone } = await getOrgSettings(orgId!);
  const period = resolvePeriod(timezone, {
    period: str(sp.period),
    from: str(sp.from),
    to: str(sp.to),
  });

  const result = await getProductPnl(orgId!, { from: period.from, to: period.to });

  return (
    <ProductPnlView
      currency={currency}
      period={{ kind: period.kind, label: period.label }}
      result={result}
    />
  );
}
