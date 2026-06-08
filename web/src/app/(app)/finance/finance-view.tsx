"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { FinanceSummary } from "@/lib/finance/summary";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addRemittanceAction,
  deleteRemittanceAction,
  updateFeesAction,
  updateRemittanceAction,
} from "./actions";

const BRAND = "var(--chart-1)";

interface Remittance {
  id: string;
  amount: number;
  date: string;
  reference: string | null;
  note: string | null;
  createdBy: string;
}
interface Fees {
  shippingFeePerParcel: number | null;
  codCommissionPct: number | null;
  returnFee: number | null;
}
interface PeriodInfo {
  kind: string;
  label: string;
  fromStr: string;
  toStr: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function Card1({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function FinanceView({
  currency,
  period,
  summary,
  remittances,
  fees,
}: {
  currency: string;
  period: PeriodInfo;
  summary: FinanceSummary;
  remittances: Remittance[];
  fees: Fees;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const money = (n: number) => formatMoney(n, currency);

  const go = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    router.push(`/finance?${sp.toString()}`);
  };

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(ok);
        router.refresh();
      } else toast.error(res.message ?? "Action refusée.");
    });
  }

  // Remittance dialog state
  const [editing, setEditing] = React.useState<Remittance | null>(null);
  const [dlgOpen, setDlgOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [delTarget, setDelTarget] = React.useState<Remittance | null>(null);

  function openAdd() {
    setEditing(null);
    setAmount("");
    setDate(today());
    setReference("");
    setNote("");
    setDlgOpen(true);
  }
  function openEdit(r: Remittance) {
    setEditing(r);
    setAmount(String(r.amount));
    setDate(r.date.slice(0, 10));
    setReference(r.reference ?? "");
    setNote(r.note ?? "");
    setDlgOpen(true);
  }
  function saveRemittance() {
    const payload = { amount, date, reference, note };
    setDlgOpen(false);
    run(
      () =>
        editing
          ? updateRemittanceAction({ id: editing.id, ...payload })
          : addRemittanceAction(payload),
      editing ? "Versement mis à jour." : "Versement ajouté."
    );
  }

  // Fees editor state
  const [ship, setShip] = React.useState(fees.shippingFeePerParcel?.toString() ?? "");
  const [comm, setComm] = React.useState(fees.codCommissionPct?.toString() ?? "");
  const [ret, setRet] = React.useState(fees.returnFee?.toString() ?? "");

  const o = summary.overview;
  const s = summary.summary;

  const PERIODS: { key: string; label: string }[] = [
    { key: "today", label: "Aujourd'hui" },
    { key: "week", label: "7 jours" },
    { key: "month", label: "Ce mois" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Finance" subtitle={`Vue COD — ${period.label}`} />

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={period.kind === p.key ? "default" : "outline"}
            onClick={() => go({ period: p.key })}
          >
            {p.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="date"
            defaultValue={period.fromStr}
            className="h-8 w-auto"
            id="fin-from"
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            type="date"
            defaultValue={period.toStr}
            className="h-8 w-auto"
            id="fin-to"
          />
          <Button
            size="sm"
            variant={period.kind === "custom" ? "default" : "outline"}
            onClick={() => {
              const from = (document.getElementById("fin-from") as HTMLInputElement)?.value;
              const to = (document.getElementById("fin-to") as HTMLInputElement)?.value;
              if (from && to) go({ period: "custom", from, to });
            }}
          >
            Appliquer
          </Button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Card1 label="En cours" value={money(o.enCours)} />
        <Card1 label="Livré — à encaisser" value={money(o.livre)} tone="text-green" />
        <Card1 label="Versé — encaissé" value={money(o.verse)} tone="text-green" />
        <Card1
          label="En attente de versement"
          value={money(o.enAttente)}
          hint="Livré − Versé"
        />
        <Card1
          label="Retours"
          value={money(o.retours)}
          tone={o.retours > 0 ? "text-destructive" : undefined}
        />
      </div>

      {/* Period summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Résumé de la période</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Commandes" value={formatNumber(s.commandes)} />
          <Stat label="COD créé" value={money(s.codCree)} />
          <Stat label="COD livré" value={money(s.codLivre)} />
          <Stat label="COD retourné" value={money(s.codRetourne)} />
          <Stat label="Taux de retour" value={`${s.tauxRetour}%`} />
          {s.fees ? (
            <>
              <Stat label="Frais estimés" value={money(s.fees.fraisEstimes)} tag="estimé" />
              <Stat label="Net estimé" value={money(s.fees.netEstime)} tag="estimé" />
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">COD livré — tendance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.trend} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="finFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip
                  formatter={(v) => [money(Number(v)), "COD livré"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="cod" stroke={BRAND} strokeWidth={2} fill="url(#finFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Versements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Versements (encaissé)</CardTitle>
          <Button size="sm" onClick={openAdd} disabled={pending}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </CardHeader>
        <CardContent>
          {remittances.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Aucun versement sur la période.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {remittances.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="text-muted-foreground w-24 shrink-0">{formatDate(r.date)}</span>
                  <span className="font-mono tabular-nums">{money(r.amount)}</span>
                  {r.reference ? <span className="text-muted-foreground">{r.reference}</span> : null}
                  {r.note ? <span className="truncate">{r.note}</span> : null}
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">{r.createdBy}</span>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)} disabled={pending} aria-label="Modifier">
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDelTarget(r)} disabled={pending} aria-label="Supprimer">
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Fees / estimation settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paramètres d&apos;estimation (frais)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Frais livraison / colis</Label>
            <Input value={ship} onChange={(e) => setShip(e.target.value)} className="h-8 w-36" placeholder="ex. 25" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Commission COD (%)</Label>
            <Input value={comm} onChange={(e) => setComm(e.target.value)} className="h-8 w-36" placeholder="ex. 5" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Frais de retour</Label>
            <Input value={ret} onChange={(e) => setRet(e.target.value)} className="h-8 w-36" placeholder="ex. 15" />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  updateFeesAction({
                    shippingFeePerParcel: ship,
                    codCommissionPct: comm,
                    returnFee: ret,
                  }),
                "Frais enregistrés."
              )
            }
          >
            Enregistrer
          </Button>
          <p className="text-muted-foreground w-full text-xs">
            Renseignez au moins un champ pour afficher le « net estimé ». Laissez vide pour le masquer.
          </p>
        </CardContent>
      </Card>

      {/* Add/edit remittance dialog */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le versement" : "Ajouter un versement"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="r-amount">Montant ({currency})</Label>
              <Input id="r-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="r-date">Date</Label>
              <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="r-ref">Référence (payout Ozon)</Label>
              <Input id="r-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="r-note">Note</Label>
              <Input id="r-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button onClick={saveRemittance} disabled={pending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delTarget} onOpenChange={(open) => !open && setDelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le versement</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {delTarget ? `Supprimer le versement de ${money(delTarget.amount)} du ${formatDate(delTarget.date)} ?` : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const t = delTarget;
                if (!t) return;
                setDelTarget(null);
                run(() => deleteRemittanceAction({ id: t.id }), "Versement supprimé.");
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">
        {label}
        {tag ? <span className="text-amber ml-1 italic">« {tag} »</span> : null}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
