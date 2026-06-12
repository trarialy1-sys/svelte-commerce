"use client";

import * as React from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";

import { formatMoney } from "@/lib/format";
import type {
  CityPnlRow,
  ProductPnlResult,
  ProductPnlRow,
} from "@/lib/finance/product-pnl";
import type { CashPosition } from "@/lib/finance/cashflow";

const VERDICT: Record<
  ProductPnlRow["verdict"],
  { label: string; tone: "green" | "amber" | "red" | "neutral" }
> = {
  SCALE: { label: "Scaler", tone: "green" },
  WATCH: { label: "Surveiller", tone: "amber" },
  KILL: { label: "Couper", tone: "red" },
  NONE: { label: "—", tone: "neutral" },
};
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PERIODS: { kind: string; label: string }[] = [
  { kind: "today", label: "Aujourd'hui" },
  { kind: "week", label: "7 jours" },
  { kind: "month", label: "Ce mois" },
];

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function ProductPnlView({
  currency,
  period,
  result,
  cities,
  cash,
}: {
  currency: string;
  period: { kind: string; label: string };
  result: ProductPnlResult;
  cities: CityPnlRow[];
  cash: CashPosition;
}) {
  const [detail, setDetail] = React.useState<ProductPnlRow | null>(null);
  const money = (n: number) => formatMoney(n, currency);
  const { rows, totals } = result;

  return (
    <>
      <PageHeader
        title="P&L par produit"
        subtitle="Profit net réel par produit — après livraison, retours, commission COD, pub et confirmation."
      />

      {/* Period switcher */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.kind}
            href={`/finance/products?period=${p.kind}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              period.kind === p.kind
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <span className="text-muted-foreground self-center pl-2 text-sm">{period.label}</span>
      </div>

      {/* Totals */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Chiffre d'affaires" value={money(totals.revenue)} />
        <Kpi
          label="Profit net"
          value={money(totals.net)}
          tone={totals.net >= 0 ? "green" : "red"}
        />
        <Kpi label="Marge" value={totals.revenue > 0 ? pct(totals.margin) : "—"} />
        <Kpi label="Taux de livraison" value={pct(totals.deliveryRate)} />
      </div>

      {/* Trésorerie — cash timing snapshot (not period-bound) */}
      <div className="mb-6">
        <h2 className="mb-1 font-semibold">Trésorerie</h2>
        <p className="text-muted-foreground mb-2 text-sm">
          Le COD rentre avec un décalage (livraison puis versement Ozon), alors que
          la pub et le stock sont payés d&apos;avance.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="COD en transit" value={money(cash.inTransitCod)} />
          <Kpi label="Livré, à encaisser" value={money(cash.awaitingRemittance)} tone="green" />
          <Kpi label="Déjà versé" value={money(cash.remitted)} />
          <Kpi label="Capital en stock" value={money(cash.stockValue)} tone="red" />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Aucune donnée sur la période"
          message="Les produits livrés sur la période apparaîtront ici avec leur profit net."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Produit</th>
                <th className="px-3 py-2 text-right font-medium">Livrées</th>
                <th className="px-3 py-2 text-right font-medium">Taux liv.</th>
                <th className="px-3 py-2 text-right font-medium">CA</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
                <th className="px-3 py-2 text-right font-medium">Marge</th>
                <th className="px-3 py-2 text-right font-medium">Net/livrée</th>
                <th className="px-3 py-2 text-right font-medium">CPA</th>
                <th className="px-3 py-2 text-right font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr
                  key={r.sku}
                  className="hover:bg-accent/50 cursor-pointer"
                  onClick={() => setDetail(r)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.title ?? r.sku}</div>
                    <div className="text-muted-foreground font-mono text-xs">{r.sku}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.unitsDelivered}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.deliveryRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.revenue)}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium tabular-nums ${
                      r.net >= 0 ? "text-green" : "text-destructive"
                    }`}
                  >
                    {money(r.net)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.revenue > 0 ? pct(r.margin) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.netPerDelivered)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.cpa)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.verdict !== "NONE" ? (
                      <StatusBadge
                        status={r.verdict}
                        tone={VERDICT[r.verdict].tone}
                        label={VERDICT[r.verdict].label}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-city P&L — net-negative cities first */}
      {cities.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-1 font-semibold">Rentabilité par ville</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            Économie de livraison par ville (hors publicité). Les villes en perte
            (souvent fort taux de retour) sont en rouge — à arbitrer ou passer en
            prépaiement partiel.
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Ville</th>
                  <th className="px-3 py-2 text-right font-medium">Livrées</th>
                  <th className="px-3 py-2 text-right font-medium">Retours</th>
                  <th className="px-3 py-2 text-right font-medium">Taux liv.</th>
                  <th className="px-3 py-2 text-right font-medium">CA</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cities.slice(0, 60).map((c) => (
                  <tr key={c.cityId ?? "none"} className={c.net < 0 ? "bg-destructive/5" : ""}>
                    <td className="px-3 py-2 font-medium">{c.cityName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.deliveredOrders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.returnedOrders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(c.deliveryRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(c.revenue)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        c.net >= 0 ? "text-green" : "text-destructive"
                      }`}
                    >
                      {money(c.net)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.revenue > 0 ? pct(c.margin) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <ProductDetailSheet
        row={detail}
        currency={currency}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
    </>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          tone === "green" ? "text-green" : tone === "red" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ProductDetailSheet({
  row,
  currency,
  onOpenChange,
}: {
  row: ProductPnlRow | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row ? (row.title ?? row.sku) : ""}</SheetTitle>
          <SheetDescription>
            {row ? (
              <StatusBadge
                status={row.net >= 0 ? "OK" : "PERTE"}
                tone={row.net >= 0 ? "green" : "red"}
                label={row.net >= 0 ? "Rentable" : "À perte"}
              />
            ) : (
              "Détail"
            )}
          </SheetDescription>
        </SheetHeader>

        {row ? (
          <div className="flex flex-col gap-5 px-4 pb-6">
            {/* Waterfall */}
            <section className="flex flex-col gap-1 text-sm">
              <Line label="Chiffre d'affaires (livré)" value={money(row.revenue)} strong />
              <Line label="− Coût produit (COGS)" value={`− ${money(row.cogs)}`} />
              <Line label="− Livraison Ozon" value={`− ${money(row.delivery)}`} />
              <Line label="− Retours" value={`− ${money(row.returns)}`} />
              <Line label="− Commission COD" value={`− ${money(row.codCommission)}`} />
              <Line label="− Publicité" value={`− ${money(row.adSpend)}`} />
              <Line label="− Confirmation" value={`− ${money(row.confirmation)}`} />
              <div className="my-1 border-t" />
              <Line
                label="Profit net"
                value={money(row.net)}
                strong
                tone={row.net >= 0 ? "green" : "red"}
              />
              <Line
                label="Marge"
                value={row.revenue > 0 ? pct(row.margin) : "—"}
              />
            </section>

            <section className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Unités livrées" value={String(row.unitsDelivered)} />
              <Field label="Unités retournées" value={String(row.unitsReturned)} />
              <Field label="Taux de livraison" value={pct(row.deliveryRate)} />
              <Field label="CPA" value={money(row.cpa)} />
              <Field label="Net / livrée" value={money(row.netPerDelivered)} />
              <Field
                label="Net / expédiée (réel)"
                value={money(row.netPerShipped)}
              />
            </section>
            <p className="text-muted-foreground text-xs">
              « Net / expédiée » répartit le coût des échecs sur les commandes
              livrées — c&apos;est le profit réel par commande envoyée.
            </p>

            {/* Decision guardrails (4.4) */}
            <section className="flex flex-col gap-2 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Repères de décision</h3>
              <Guard
                label="Taux de livraison — seuil de rentabilité"
                current={pct(row.deliveryRate)}
                target={
                  row.breakEvenDeliveryRate == null
                    ? "rentable à tout taux"
                    : row.breakEvenDeliveryRate > 1
                      ? "jamais rentable"
                      : `seuil ${pct(row.breakEvenDeliveryRate)}`
                }
                good={
                  row.breakEvenDeliveryRate == null ||
                  (row.breakEvenDeliveryRate <= 1 &&
                    row.deliveryRate >= row.breakEvenDeliveryRate)
                }
              />
              <Guard
                label="CPA — actuel vs maximum rentable"
                current={money(row.cpa)}
                target={row.maxCpa == null ? "—" : `max ${money(row.maxCpa)}`}
                good={row.maxCpa != null && row.cpa <= row.maxCpa}
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">ROAS ajusté (livraison)</span>
                <span className="font-medium tabular-nums">
                  {row.deliveryAdjustedRoas != null ? `${row.deliveryAdjustedRoas}×` : "—"}
                </span>
              </div>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "green" | "red";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""} ${
          tone === "green" ? "text-green" : tone === "red" ? "text-destructive" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Guard({
  label,
  current,
  target,
  good,
}: {
  label: string;
  current: string;
  target: string;
  good: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums font-medium">{current}</span>
        <span className={`text-xs ${good ? "text-green" : "text-destructive"}`}>
          ({target})
        </span>
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
