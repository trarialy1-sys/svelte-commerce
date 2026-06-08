"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ReportKey = "performance" | "villes" | "produits";

export interface PeriodInfo {
  kind: string;
  label: string;
  fromStr: string;
  toStr: string;
}

const TABS: { key: ReportKey; label: string; href: string }[] = [
  { key: "performance", label: "Performance", href: "/reports" },
  { key: "villes", label: "Par ville", href: "/reports/villes" },
  { key: "produits", label: "Par produit", href: "/reports/produits" },
];

const PRESETS: { key: string; label: string }[] = [
  { key: "7d", label: "7 j" },
  { key: "30d", label: "30 j" },
  { key: "month", label: "Ce mois" },
  { key: "lastMonth", label: "Mois dernier" },
  { key: "quarter", label: "Ce trimestre" },
];

/** Build the current period query string (for tab links + exports). */
function periodQuery(period: PeriodInfo): string {
  const sp = new URLSearchParams({ period: period.kind });
  if (period.kind === "custom") {
    sp.set("from", period.fromStr);
    sp.set("to", period.toStr);
  }
  return sp.toString();
}

export function ReportsControls({
  reportKey,
  period,
}: {
  reportKey: ReportKey;
  period: PeriodInfo;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const q = periodQuery(period);

  const go = (params: Record<string, string>) => {
    const base = pathname || "/reports";
    router.push(`${base}?${new URLSearchParams(params).toString()}`);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Report tabs — preserve the active period across reports */}
      <div className="flex flex-wrap items-center gap-1 border-b">
        {TABS.map((t) => {
          const active = t.key === reportKey;
          return (
            <Link
              key={t.key}
              href={`${t.href}?${q}`}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Date range: presets + custom + export */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={period.kind === p.key ? "default" : "outline"}
            onClick={() => go({ period: p.key })}
          >
            {p.label}
          </Button>
        ))}

        <div className="flex items-center gap-2">
          <Input
            type="date"
            defaultValue={period.fromStr}
            className="h-8 w-auto"
            id="rep-from"
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            type="date"
            defaultValue={period.toStr}
            className="h-8 w-auto"
            id="rep-to"
          />
          <Button
            size="sm"
            variant={period.kind === "custom" ? "default" : "outline"}
            onClick={() => {
              const from = (document.getElementById("rep-from") as HTMLInputElement)?.value;
              const to = (document.getElementById("rep-to") as HTMLInputElement)?.value;
              if (from && to) go({ period: "custom", from, to });
            }}
          >
            Appliquer
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/reports/${reportKey}/export?format=csv&${q}`}>
              <Download className="size-4" /> CSV
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/reports/${reportKey}/export?format=xlsx&${q}`}>
              <Download className="size-4" /> XLSX
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
