"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  MapPin,
  PackageX,
  RefreshCw,
  Send,
  ShoppingBag,
  Upload,
} from "lucide-react";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { formatMoney, formatNumber } from "@/lib/format";
import type { DashboardSummary } from "@/lib/dashboard/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const BRAND = "var(--chart-1)";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

function Kpi({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: "amber" | "red" | "green";
  href?: string;
}) {
  const valueClass =
    tone === "red"
      ? "text-destructive"
      : tone === "amber"
        ? "text-amber"
        : tone === "green"
          ? "text-green"
          : "text-foreground";
  const body = (
    <Card className={href ? "transition hover:border-primary/50" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className={`text-2xl font-semibold tabular-nums ${valueClass}`}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const ATTENTION_META: Record<
  DashboardSummary["attention"][number]["kind"],
  { label: string; icon: typeof ClipboardList }
> = {
  orders_a_confirmer: { label: "Commandes à confirmer", icon: ClipboardList },
  parcels_probleme: { label: "Colis en problème (retours/refus)", icon: AlertTriangle },
  stock_oos: { label: "Articles en rupture", icon: PackageX },
  cities_unresolved: { label: "Villes à corriger avant envoi", icon: MapPin },
};

export function DashboardView({
  role,
  currency = "MAD",
}: {
  role: AppRole | null;
  currency?: string;
}) {
  const { data, isPending, isError } = useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Échec du chargement");
      return res.json();
    },
  });

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de votre activité — tout en un coup d'œil."
      />

      {isError ? (
        <Card>
          <CardContent className="text-destructive py-8 text-center text-sm">
            Échec du chargement du tableau de bord.
          </CardContent>
        </Card>
      ) : isPending || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Kpi
              label="À confirmer"
              value={formatNumber(data.orders.aConfirmer)}
              tone={data.orders.aConfirmer > 0 ? "amber" : undefined}
              href="/orders?status=NOUVELLE"
            />
            <Kpi
              label="Prêtes à expédier"
              value={formatNumber(data.orders.pretes)}
              href="/shipping"
            />
            <Kpi
              label="Nouvelles aujourd'hui"
              value={formatNumber(data.orders.nouvellesToday)}
            />
            <Kpi label="En transit" value={formatNumber(data.parcels.enTransit)} />
            <Kpi label="Livré (7 j)" value={formatNumber(data.parcels.livreWeek)} tone="green" />
            <Kpi
              label="Problèmes"
              value={formatNumber(data.parcels.problemes)}
              tone={data.parcels.problemes > 0 ? "red" : undefined}
            />
            <Kpi
              label="En rupture"
              value={formatNumber(data.stock.oos)}
              tone={data.stock.oos > 0 ? "red" : undefined}
              href="/stock?stockState=RUPTURE"
            />
            <Kpi
              label="Stock bas"
              value={formatNumber(data.stock.low)}
              tone={data.stock.low > 0 ? "amber" : undefined}
              href="/stock?stockState=FAIBLE"
            />

            {data.finance ? (
              <>
                <Kpi
                  label="Livré (à encaisser)"
                  value={formatMoney(data.finance.livreAEncaisser, currency)}
                  tone="green"
                />
                <Kpi
                  label="En cours"
                  value={formatMoney(data.finance.enCours, currency)}
                />
                <Kpi
                  label="Retours"
                  value={formatMoney(data.finance.retours, currency)}
                  tone={data.finance.retours > 0 ? "red" : undefined}
                />
              </>
            ) : null}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* À traiter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">À traiter</CardTitle>
              </CardHeader>
              <CardContent>
                {data.attention.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    🎉 Rien à traiter — tout est à jour.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.attention.map((a) => {
                      const meta = ATTENTION_META[a.kind];
                      const Icon = meta.icon;
                      return (
                        <li key={a.kind}>
                          <Link
                            href={a.href}
                            className="hover:bg-accent flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                          >
                            <Icon className="text-muted-foreground size-4 shrink-0" />
                            <span className="font-semibold tabular-nums">
                              {formatNumber(a.count)}
                            </span>
                            <span className="flex-1">{meta.label}</span>
                            <ArrowRight className="text-muted-foreground size-4" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Activité récente */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activité récente</CardTitle>
              </CardHeader>
              <CardContent>
                {data.activity.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Aucune activité récente.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {data.activity.map((ev) => (
                      <li key={ev.id} className="flex items-baseline gap-2 text-sm">
                        <span className="font-medium">{ev.actorName}</span>
                        <span className="text-muted-foreground flex-1">
                          {ev.action}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {relativeTime(ev.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Actions rapides */}
          <QuickActions role={role} />

          {/* Tendance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tendance — commandes / jour (14 j)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.trend}
                    margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
                  >
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      hide
                    />
                    <Tooltip
                      labelFormatter={(d) => String(d)}
                      formatter={(v) => [`${v} commande(s)`, ""]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="orders"
                      stroke={BRAND}
                      strokeWidth={2}
                      fill="url(#trendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function QuickActions({ role }: { role: AppRole | null }) {
  const actions: {
    label: string;
    href: string;
    icon: typeof Upload;
    minRole: AppRole;
  }[] = [
    { label: "Importer commandes", href: "/orders", icon: Upload, minRole: "operator" },
    {
      label: "File de confirmation",
      href: "/orders?status=NOUVELLE",
      icon: ClipboardCheck,
      minRole: "viewer",
    },
    { label: "Envoyer le lot prêt", href: "/shipping", icon: Send, minRole: "operator" },
    {
      label: "Sync stock Shopify",
      href: "/products",
      icon: ShoppingBag,
      minRole: "operator",
    },
    {
      label: "Actualiser les villes",
      href: "/settings",
      icon: RefreshCw,
      minRole: "admin",
    },
  ];
  const visible = actions.filter((a) => meetsOrgRole(role, a.minRole));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions rapides</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {visible.map((a) => {
          const Icon = a.icon;
          return (
            <Button key={a.label} asChild variant="outline" size="sm">
              <Link href={a.href}>
                <Icon className="size-4" />
                {a.label}
              </Link>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
