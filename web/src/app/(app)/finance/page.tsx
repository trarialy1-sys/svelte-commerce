import { requireOrgRole } from "@/lib/auth";
import { db, getOrgDb } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import { resolvePeriod } from "@/lib/finance/period";
import { getFinanceSummary } from "@/lib/finance/summary";
import { FinanceView } from "./finance-view";
import { CostInputs } from "./cost-inputs";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Entire Finance route is owner/admin only (redirects others).
  const { orgId } = await requireOrgRole("admin");
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { currency, timezone } = await getOrgSettings(orgId!);
  const period = resolvePeriod(timezone, {
    period: str(sp.period),
    from: str(sp.from),
    to: str(sp.to),
  });

  const odb = getOrgDb(orgId!);
  const [summary, remittances, settings, adSpends] = await Promise.all([
    getFinanceSummary(orgId!, period),
    odb.remittance.findMany({
      where: { date: { gte: period.from, lte: period.to } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        amount: true,
        date: true,
        reference: true,
        note: true,
        createdById: true,
      },
    }),
    odb.financeSettings.findUnique({ where: { orgId: orgId! } }),
    odb.adSpend.findMany({
      orderBy: { periodStart: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        periodStart: true,
        periodEnd: true,
        variantId: true,
        note: true,
      },
    }),
  ]);

  // Resolve product labels for ad-spend rows tied to a variant.
  const adVariantIds = [
    ...new Set(adSpends.map((a) => a.variantId).filter((x): x is string => !!x)),
  ];
  const adVariants = adVariantIds.length
    ? await odb.variant.findMany({
        where: { id: { in: adVariantIds } },
        select: { id: true, sku: true, title: true },
      })
    : [];
  const productById = new Map(
    adVariants.map((v) => [v.id, v.title || v.sku])
  );

  // Resolve "créé par" names (createdById is a Clerk id, User is global).
  const ids = [
    ...new Set(remittances.map((r) => r.createdById).filter((x): x is string => !!x)),
  ];
  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name || u.email || "—"]));

  return (
    <>
      <FinanceView
        currency={currency}
        period={{
          kind: period.kind,
          label: period.label,
          fromStr: period.fromStr,
          toStr: period.toStr,
        }}
        summary={summary}
        remittances={remittances.map((r) => ({
          id: r.id,
          amount: Number(r.amount),
          date: r.date.toISOString(),
          reference: r.reference,
          note: r.note,
          createdBy: r.createdById ? nameById.get(r.createdById) ?? "—" : "—",
        }))}
        fees={{
          shippingFeePerParcel: settings?.shippingFeePerParcel
            ? Number(settings.shippingFeePerParcel)
            : null,
          codCommissionPct: settings?.codCommissionPct
            ? Number(settings.codCommissionPct)
            : null,
          returnFee: settings?.returnFee ? Number(settings.returnFee) : null,
        }}
      />
      <CostInputs
        currency={currency}
        confirmationCostPerOrder={
          settings?.confirmationCostPerOrder
            ? Number(settings.confirmationCostPerOrder)
            : null
        }
        adSpends={adSpends.map((a) => ({
          id: a.id,
          amount: Number(a.amount),
          periodStart: a.periodStart.toISOString().slice(0, 10),
          periodEnd: a.periodEnd.toISOString().slice(0, 10),
          product: a.variantId ? productById.get(a.variantId) ?? "—" : null,
        }))}
      />
    </>
  );
}
