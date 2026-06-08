"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { formatMoney, formatNumber } from "@/lib/format";
import type { PerformanceReport, PerfTotals } from "@/lib/reports/performance";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const GOOD = "text-green";
const BAD = "text-destructive";

/** % change current vs previous; null when previous is 0 and current is 0. */
function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? null : 100;
  return Math.round(((cur - prev) / prev) * 100);
}

function Delta({
  cur,
  prev,
  goodWhenUp = true,
}: {
  cur: number;
  prev: number;
  goodWhenUp?: boolean;
}) {
  const d = pctDelta(cur, prev);
  if (d == null)
    return <span className="text-muted-foreground text-xs">— vs préc.</span>;
  const up = d > 0;
  const flat = d === 0;
  const good = flat ? false : up === goodWhenUp;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs ${
        flat ? "text-muted-foreground" : good ? GOOD : BAD
      }`}
      title="vs période précédente"
    >
      <Icon className="size-3" />
      {Math.abs(d)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  cur,
  prev,
  goodWhenUp = true,
  tone,
}: {
  label: string;
  value: string;
  cur: number;
  prev: number;
  goodWhenUp?: boolean;
  tone?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>
          {value}
        </span>
        <Delta cur={cur} prev={prev} goodWhenUp={goodWhenUp} />
      </CardContent>
    </Card>
  );
}

export function PerformanceView({
  report,
  currency,
}: {
  report: PerformanceReport;
  currency: string;
}) {
  const t: PerfTotals = report.totals;
  const p: PerfTotals = report.previous;
  const money = (n: number) => formatMoney(n, currency);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs with vs-previous deltas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard label="Commandes" value={formatNumber(t.orders)} cur={t.orders} prev={p.orders} />
        <KpiCard
          label="Taux de livraison"
          value={`${t.deliveryRate}%`}
          cur={t.deliveryRate}
          prev={p.deliveryRate}
        />
        <KpiCard
          label="Taux de retour"
          value={`${t.returnRate}%`}
          cur={t.returnRate}
          prev={p.returnRate}
          goodWhenUp={false}
          tone={t.returnRate > 0 ? BAD : undefined}
        />
        <KpiCard
          label="Livraisons"
          value={formatNumber(t.delivered)}
          cur={t.delivered}
          prev={p.delivered}
        />
        <KpiCard label="COD créé" value={money(t.codCree)} cur={t.codCree} prev={p.codCree} />
        <KpiCard
          label="COD livré"
          value={money(t.codLivre)}
          cur={t.codLivre}
          prev={p.codLivre}
          tone={GOOD}
        />
        <KpiCard
          label="Retours (COD)"
          value={money(t.codRetours)}
          cur={t.codRetours}
          prev={p.codRetours}
          goodWhenUp={false}
        />
        <KpiCard label="Versé" value={money(t.verse)} cur={t.verse} prev={p.verse} tone={GOOD} />
      </div>

      {/* Volume trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volume — tendance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.buckets} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="orders" name="Commandes" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="delivered" name="Livré" stroke="var(--green)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="returned" name="Retours" stroke="var(--destructive)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per-bucket breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détail par période</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Période</TableHead>
                  <TableHead className="text-right">Commandes</TableHead>
                  <TableHead className="text-right">Livré</TableHead>
                  <TableHead className="text-right">Retours</TableHead>
                  <TableHead className="text-right">COD créé</TableHead>
                  <TableHead className="text-right">COD livré</TableHead>
                  <TableHead className="text-right">Versé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.buckets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground py-6 text-center">
                      Aucune donnée sur la période.
                    </TableCell>
                  </TableRow>
                ) : (
                  report.buckets.map((b) => (
                    <TableRow key={b.date}>
                      <TableCell className="font-mono text-xs">{b.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(b.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(b.delivered)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(b.returned)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(b.codCree)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(b.codLivre)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(b.verse)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
