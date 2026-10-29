"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { confirmReturnAction, correctReturnAction } from "./actions";

export interface ReturnItem {
  sku: string;
  qty: number;
  name: string;
  variant: string;
  image: string | null;
}

export interface ReturnRow {
  id: string;
  tracking: string;
  order: string;
  customer: string;
  city: string;
  /** When Partner OS saw « Reçu par client » (ISO). */
  returnedAt: string;
  /** Ozon's own event time, e.g. "2026-10-28 14:03". */
  ozonEventAt: string | null;
  check: string | null;
  checkNote: string | null;
  items: ReturnItem[];
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function ReturnCard({ row, canAct }: { row: ReturnRow; canAct: boolean }) {
  const router = useRouter();
  const [wrong, setWrong] = React.useState<Set<string>>(new Set());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"ok" | "fix" | null>(null);
  const age = ageDays(row.returnedAt);

  async function confirm() {
    setBusy("ok");
    const r = await confirmReturnAction(row.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.message);
    toast.success(`${row.tracking} vérifié ✔`);
    router.refresh();
  }

  async function fix() {
    if (wrong.size === 0) return toast.error("Coche l'article qui n'est pas le bon.");
    if (!note.trim()) return toast.error("Écris une explication (ex. : produit pas à nous).");
    setBusy("fix");
    const r = await correctReturnAction(row.id, [...wrong], note);
    setBusy(null);
    if (!r.ok) return toast.error(r.message);
    if (r.data.failed.length) toast.warning(`À vérifier : ${r.data.failed.join(", ")}`);
    toast.success(`Stock corrigé : ${r.data.removed.join(", ") || "—"}`);
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold">{row.tracking}</div>
          <div className="text-xs text-muted-foreground">
            {row.order} · {row.customer} · {row.city}
            {row.ozonEventAt ? ` · rendu par Ozon le ${row.ozonEventAt}` : ""}
          </div>
        </div>
        <Badge variant="secondary">✔ Remis en stock automatiquement</Badge>
      </div>

      {age > 3 ? (
        <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
          <TriangleAlert className="size-4" />
          Rendu par Ozon il y a {age} jours — pas encore vérifié
        </div>
      ) : null}

      <div className="mt-3 divide-y">
        {row.items.map((it) => (
          <label
            key={it.sku}
            className="flex cursor-pointer items-center gap-3 py-2"
          >
            {it.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.image}
                alt=""
                className="size-14 shrink-0 rounded-lg border object-cover"
              />
            ) : (
              <div className="size-14 shrink-0 rounded-lg border bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{it.name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {it.sku}
                {it.qty > 1 ? ` × ${it.qty}` : ""}
              </div>
            </div>
            {canAct ? (
              <span className="flex items-center gap-2 text-xs whitespace-nowrap">
                <Checkbox
                  checked={wrong.has(it.sku)}
                  onCheckedChange={(v) =>
                    setWrong((s) => {
                      const n = new Set(s);
                      if (v) n.add(it.sku);
                      else n.delete(it.sku);
                      return n;
                    })
                  }
                />
                pas le bon
              </span>
            ) : null}
          </label>
        ))}
      </div>

      {canAct ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button onClick={confirm} disabled={busy !== null}>
            {busy === "ok" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Tout est bon
          </Button>
          <div className="flex gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explication (ex. : produit pas à nous)"
            />
            <Button variant="outline" onClick={fix} disabled={busy !== null}>
              {busy === "fix" ? <Loader2 className="animate-spin" /> : <Undo2 />}
              Retirer les cochés
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ReturnsView({
  rows,
  done,
  role,
}: {
  rows: ReturnRow[];
  done: ReturnRow[];
  role: AppRole | null;
}) {
  const canAct = meetsOrgRole(role, "operator");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Retours à vérifier"
        subtitle="Colis rendus par Ozon (« Reçu par client ») : le stock est déjà remis. Ouvre le colis et compare avec les photos — si un article n'est pas le bon, coche-le pour le retirer du stock."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Aucun retour à vérifier"
          message="Les retours apparaissent ici dès qu'Ozon les marque « Reçu par client »."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <ReturnCard key={r.id} row={r} canAct={canAct} />
          ))}
        </div>
      )}

      {done.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Derniers retours vérifiés</h2>
          <div className="divide-y rounded-xl border bg-card text-sm">
            {done.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="font-mono">{r.tracking}</span>
                <span className="text-muted-foreground">{r.order}</span>
                {r.check === "OK" ? (
                  <Badge variant="secondary">✔ OK</Badge>
                ) : (
                  <Badge variant="destructive">✘ corrigé</Badge>
                )}
                {r.checkNote ? <span className="text-muted-foreground">— {r.checkNote}</span> : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {DATE_FMT.format(new Date(r.returnedAt))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
