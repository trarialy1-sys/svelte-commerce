"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, MapPin, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { saveCityPickAction, saveCityPicksAction } from "./actions";

export interface CityRow {
  id: number;
  name: string;
}
export interface ShippingRow {
  id: string;
  code: string;
  customer: string;
  phone: string;
  cityRaw: string;
  address: string;
  total: number;
  savedCityId: number | null;
  suggestedId: number | null;
  suggestedName: string;
  method: string;
}

/** Client-side normalize (mirrors lib/shipping cityKey) for picker filtering. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const METHOD_LABEL: Record<string, string> = {
  saved: "Enregistrée",
  alias: "Mémorisée",
  exact: "Exacte",
  casa: "Quartier Casa",
  fuzzy: "Approx.",
  none: "À corriger",
};
const METHOD_TONE: Record<string, "green" | "blue" | "amber" | "red"> = {
  saved: "green",
  alias: "green",
  exact: "green",
  casa: "blue",
  fuzzy: "amber",
  none: "red",
};

function CityPicker({
  cities,
  valueName,
  onPick,
  disabled,
}: {
  cities: CityRow[];
  valueName: string;
  onPick: (c: CityRow) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const results = React.useMemo(() => {
    const key = norm(q);
    const qid = q.trim();
    const out: CityRow[] = [];
    for (const c of cities) {
      if (norm(c.name).includes(key) || String(c.id) === qid) {
        out.push(c);
        if (out.length >= 12) break;
      }
    }
    return out;
  }, [q, cities]);

  return (
    <div className="relative w-full sm:w-72">
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <input
        className="border-input bg-background h-9 w-full rounded-md border pl-8 pr-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        placeholder="Chercher une ville…"
        value={open ? q : valueName}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && results.length > 0 ? (
        <div className="bg-popover absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border shadow-md">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(c);
                setOpen(false);
              }}
            >
              <span>{c.name}</span>
              <span className="text-muted-foreground text-xs">{c.id}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ShippingView({
  rows,
  cities,
  role,
  cityCount,
}: {
  rows: ShippingRow[];
  cities: CityRow[];
  role: AppRole | null;
  cityCount: number;
}) {
  const router = useRouter();
  const canWrite = meetsOrgRole(role, "operator");
  // Local optimistic overrides after a pick/save: orderId -> { id, name }.
  const [picks, setPicks] = React.useState<Record<string, CityRow>>({});
  const [busy, setBusy] = React.useState(false);

  function resolvedOf(
    row: ShippingRow
  ): { id: number; name: string } | null {
    if (picks[row.id]) return picks[row.id];
    if (row.savedCityId != null)
      return { id: row.savedCityId, name: row.suggestedName };
    return null;
  }

  const detected = rows.filter(
    (r) => !resolvedOf(r) && r.suggestedId != null
  );
  const resolvedCount = rows.filter((r) => resolvedOf(r) != null).length;
  const toFixCount = rows.length - resolvedCount;

  async function pick(row: ShippingRow, c: CityRow) {
    setBusy(true);
    try {
      const r = await saveCityPickAction(row.id, c.id, row.cityRaw);
      if (r.ok) {
        setPicks((p) => ({ ...p, [row.id]: c }));
        toast.success(`${row.code} → ${c.name}`);
      } else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDetected() {
    if (detected.length === 0) return;
    setBusy(true);
    try {
      const payload = detected.map((r) => ({
        orderId: r.id,
        cityId: r.suggestedId as number,
        cityRaw: r.cityRaw,
      }));
      const r = await saveCityPicksAction(payload);
      if (r.ok) {
        setPicks((p) => {
          const next = { ...p };
          for (const d of detected)
            next[d.id] = { id: d.suggestedId as number, name: d.suggestedName };
          return next;
        });
        toast.success(`${r.data.count} ville(s) enregistrée(s)`);
        router.refresh();
      } else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  const actions =
    canWrite && detected.length > 0 ? (
      <Button onClick={confirmDetected} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Enregistrer les villes détectées ({detected.length})
      </Button>
    ) : null;

  return (
    <>
      <PageHeader
        title="Livraisons & BL"
        subtitle="Corrigez la ville de chaque commande prête avant l'expédition."
        actions={actions}
      />

      {cityCount === 0 ? (
        <div className="bg-amber-soft text-amber mb-4 flex items-center gap-2 rounded-md border border-amber/40 px-3 py-2 text-sm">
          <TriangleAlert className="size-4" />
          Catalogue des villes non chargé —{" "}
          <Link href="/settings" className="font-semibold underline">
            ouvrir les Réglages
          </Link>{" "}
          pour le charger.
        </div>
      ) : null}

      <div className="text-muted-foreground mb-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-md border px-2 py-0.5">
          Total <b className="text-foreground">{rows.length}</b>
        </span>
        <span className="rounded-md border border-green/40 px-2 py-0.5">
          Résolues <b className="text-foreground">{resolvedCount}</b>
        </span>
        {toFixCount > 0 ? (
          <span className="rounded-md border border-destructive/40 px-2 py-0.5">
            À corriger <b className="text-foreground">{toFixCount}</b>
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucune commande prête"
          message="Les commandes confirmées sans colis apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const resolved = resolvedOf(row);
            const tone = resolved
              ? "green"
              : METHOD_TONE[row.method] ?? "neutral";
            const label = resolved
              ? "Résolue"
              : METHOD_LABEL[row.method] ?? row.method;
            return (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.customer}</span>
                    <StatusBadge status={label} tone={tone} label={label} />
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    <span className="font-mono text-xs">{row.code}</span> ·{" "}
                    {row.phone || "—"} · {formatMoney(row.total)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Ville : « {row.cityRaw || "—"} »
                    {row.address ? ` · ${row.address}` : ""}
                  </p>
                  {resolved ? (
                    <p className="text-green mt-1 text-sm font-medium">
                      → {resolved.name}
                    </p>
                  ) : row.suggestedId != null ? (
                    <p className="text-amber mt-1 text-sm">
                      Suggestion : {row.suggestedName}
                    </p>
                  ) : null}
                </div>
                {canWrite ? (
                  <CityPicker
                    cities={cities}
                    valueName={resolved?.name ?? ""}
                    disabled={busy}
                    onPick={(c) => pick(row, c)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
