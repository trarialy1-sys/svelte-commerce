"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addAdSpendAction,
  deleteAdSpendAction,
  searchVariantCostsAction,
  updateConfirmationCostAction,
  updateVariantCostAction,
  type VariantCostRow,
} from "./actions";

export interface AdSpendItem {
  id: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  product: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CostInputs({
  currency,
  confirmationCostPerOrder,
  adSpends,
}: {
  currency: string;
  confirmationCostPerOrder: number | null;
  adSpends: AdSpendItem[];
}) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold">Coûts (rentabilité)</h2>
        <p className="text-muted-foreground text-sm">
          Saisies réservées aux administrateurs — elles alimentent le calcul du
          profit net par produit.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ConfirmationCostCard initial={confirmationCostPerOrder} currency={currency} />
        <AdSpendCard items={adSpends} currency={currency} />
      </div>
      <ProductCostCard currency={currency} />
    </div>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string, after?: () => void) => {
      startTransition(async () => {
        const res = await fn();
        if (res.ok) {
          toast.success(ok);
          after?.();
          router.refresh();
        } else toast.error(res.message ?? "Action refusée.");
      });
    },
    [router]
  );
  return { pending, run };
}

function ConfirmationCostCard({
  initial,
  currency,
}: {
  initial: number | null;
  currency: string;
}) {
  const { pending, run } = useRun();
  const [value, setValue] = React.useState(initial != null ? String(initial) : "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coût de confirmation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          <Label htmlFor="conf-cost">Coût par commande confirmée ({currency})</Label>
          <Input
            id="conf-cost"
            inputMode="decimal"
            placeholder="ex : 3"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
          />
          <p className="text-muted-foreground text-xs">
            Main-d&apos;œuvre d&apos;appel par commande — appliqué à chaque commande
            traitée, livrée ou non.
          </p>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          disabled={pending}
          onClick={() =>
            run(
              () => updateConfirmationCostAction({ confirmationCostPerOrder: value }),
              "Coût de confirmation enregistré."
            )
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}

function AdSpendCard({ items, currency }: { items: AdSpendItem[]; currency: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [start, setStart] = React.useState(today());
  const [end, setEnd] = React.useState(today());
  const [note, setNote] = React.useState("");
  const [product, setProduct] = React.useState<VariantCostRow | null>(null);

  function add() {
    run(
      () =>
        addAdSpendAction({
          amount,
          periodStart: start,
          periodEnd: end,
          variantId: product?.id ?? null,
          note,
        }),
      "Dépense ajoutée.",
      () => {
        setOpen(false);
        setAmount("");
        setNote("");
        setProduct(null);
      }
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Dépenses publicitaires (Meta)</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)} disabled={pending}>
          <Plus className="size-4" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Aucune dépense enregistrée.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono tabular-nums">{formatMoney(a.amount, currency)}</span>
                <span className="text-muted-foreground text-xs">
                  {a.periodStart} → {a.periodEnd}
                </span>
                <span className="truncate">{a.product ?? "Compte (global)"}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  disabled={pending}
                  aria-label="Supprimer"
                  onClick={() => run(() => deleteAdSpendAction({ id: a.id }), "Dépense supprimée.")}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une dépense publicitaire</DialogTitle>
            <DialogDescription>
              Le moteur répartit le montant sur la période saisie.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ad-amount">Montant ({currency})</Label>
              <Input
                id="ad-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="ad-start">Début</Label>
                <Input id="ad-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ad-end">Fin</Label>
                <Input id="ad-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Produit (optionnel)</Label>
              <ProductPicker value={product} onPick={setProduct} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ad-note">Note (optionnel)</Label>
              <Input id="ad-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button onClick={add} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Debounced product search backed by searchVariantCostsAction. */
function useVariantSearch(q: string) {
  const [rows, setRows] = React.useState<VariantCostRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchVariantCostsAction(q);
      if (!cancelled) {
        setRows(res.ok ? res.rows : []);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);
  return { rows, loading };
}

function ProductPicker({
  value,
  onPick,
}: {
  value: VariantCostRow | null;
  onPick: (v: VariantCostRow | null) => void;
}) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const { rows } = useVariantSearch(open ? q : "");

  if (value) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="truncate font-medium">{value.title ?? value.sku}</span>
        <Button variant="ghost" size="sm" onClick={() => onPick(null)}>
          Changer
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        className="pl-8"
        placeholder="Chercher un produit…"
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && rows.length > 0 ? (
        <div className="bg-popover absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border shadow-md">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="hover:bg-accent flex w-full flex-col px-3 py-1.5 text-left text-sm"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(r);
                setOpen(false);
              }}
            >
              <span className="truncate font-medium">{r.title ?? r.sku}</span>
              <span className="text-muted-foreground font-mono text-xs">{r.sku}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductCostCard({ currency }: { currency: string }) {
  const [q, setQ] = React.useState("");
  const { rows, loading } = useVariantSearch(q);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coût de revient produit</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder="Chercher par SKU ou nom…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {loading && rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Aucun produit.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((r) => (
              <ProductCostRowEditor key={r.id} row={r} currency={currency} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductCostRowEditor({ row, currency }: { row: VariantCostRow; currency: string }) {
  const { pending, run } = useRun();
  const [cost, setCost] = React.useState(row.cost != null ? String(row.cost) : "");
  const [freight, setFreight] = React.useState(
    row.freightCost != null ? String(row.freightCost) : ""
  );

  const landed = (Number(cost) || 0) + (Number(freight) || 0);

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.title ?? row.sku}</p>
        <p className="text-muted-foreground font-mono text-xs">
          {row.sku} · prix {formatMoney(row.price, currency)}
        </p>
      </div>
      <div className="grid w-24 gap-1">
        <Label className="text-muted-foreground text-xs">Coût</Label>
        <Input
          className="h-8"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="grid w-24 gap-1">
        <Label className="text-muted-foreground text-xs">Fret</Label>
        <Input
          className="h-8"
          inputMode="decimal"
          value={freight}
          onChange={(e) => setFreight(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="text-muted-foreground w-28 text-xs">
        Revient<br />
        <b className="text-foreground">{formatMoney(landed, currency)}</b>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(
            () => updateVariantCostAction({ variantId: row.id, cost, freightCost: freight }),
            `${row.sku} mis à jour.`
          )
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        OK
      </Button>
    </div>
  );
}
