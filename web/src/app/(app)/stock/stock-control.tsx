"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2, PackageX, RotateCcw, Settings2, Star } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setHeroAction, setReorderConfigAction, setStockAction } from "./actions";

export type StockStatusKey = "RUPTURE" | "REORDER" | "FAIBLE" | "OK";

export interface StockRow {
  id: string;
  sku: string;
  title: string | null;
  inventoryQty: number;
  manualOOS: boolean;
  isHero: boolean;
  reorderThreshold: number | null;
  leadTimeDays: number | null;
  velocityPerDay: number;
  daysLeft: number | null;
  status: StockStatusKey;
}

const STATUS_META: Record<
  StockStatusKey,
  { label: string; tone: "red" | "amber" | "blue" | "green" }
> = {
  RUPTURE: { label: "Rupture", tone: "red" },
  REORDER: { label: "À réappro", tone: "amber" },
  FAIBLE: { label: "Faible", tone: "blue" },
  OK: { label: "OK", tone: "green" },
};

function fmtVelocity(v: number): string {
  if (v <= 0) return "0/j";
  if (v < 1) return `${v.toFixed(1)}/j`;
  return `${Math.round(v)}/j`;
}
function fmtDaysLeft(d: number | null): string {
  if (d == null) return "—";
  if (d <= 0) return "0 j";
  return `${Math.round(d)} j`;
}

export function StockControl({
  heroRows,
  reorderRows,
  canWrite,
}: {
  heroRows: StockRow[];
  reorderRows: StockRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [restock, setRestock] = React.useState<StockRow | null>(null);
  const [config, setConfig] = React.useState<StockRow | null>(null);

  async function rupture(row: StockRow) {
    setPending(row.id);
    try {
      const r = await setStockAction([row.id], "rupture");
      if (r.ok) {
        toast.success(`${row.title ?? row.sku} → rupture`);
        router.refresh();
      } else toast.error(r.message ?? "Échec");
    } finally {
      setPending(null);
    }
  }

  async function toggleHero(row: StockRow) {
    setPending(row.id);
    try {
      const r = await setHeroAction([row.id], !row.isHero);
      if (r.ok) {
        toast.success(row.isHero ? "Retiré des produits phares" : "Marqué comme phare");
        router.refresh();
      } else toast.error(r.message ?? "Échec");
    } finally {
      setPending(null);
    }
  }

  if (!canWrite) return null;
  if (heroRows.length === 0 && reorderRows.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-6">
      {heroRows.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Star className="text-amber size-4" />
            <h2 className="font-semibold">Produits phares</h2>
            <span className="text-muted-foreground text-sm">({heroRows.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {heroRows.map((row) => (
              <HeroCard
                key={row.id}
                row={row}
                pending={pending === row.id}
                onRupture={() => rupture(row)}
                onRestock={() => setRestock(row)}
                onConfig={() => setConfig(row)}
                onToggleHero={() => toggleHero(row)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {reorderRows.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="text-amber size-4" />
            <h2 className="font-semibold">À réapprovisionner</h2>
            <span className="text-muted-foreground text-sm">({reorderRows.length})</span>
          </div>
          <div className="divide-y rounded-xl border">
            {reorderRows.map((row) => (
              <ReorderRow
                key={row.id}
                row={row}
                pending={pending === row.id}
                onRupture={() => rupture(row)}
                onRestock={() => setRestock(row)}
                onToggleHero={() => toggleHero(row)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {restock ? (
        <RestockDialog
          key={restock.id}
          row={restock}
          onOpenChange={(open) => {
            if (!open) setRestock(null);
          }}
          onDone={() => {
            setRestock(null);
            router.refresh();
          }}
        />
      ) : null}
      {config ? (
        <ConfigDialog
          key={config.id}
          row={config}
          onOpenChange={(open) => {
            if (!open) setConfig(null);
          }}
          onDone={() => {
            setConfig(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Metrics({ row }: { row: StockRow }) {
  const meta = STATUS_META[row.status];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <StatusBadge status={row.status} tone={meta.tone} label={meta.label} />
      <span className="text-muted-foreground">
        Stock <b className="text-foreground">{row.inventoryQty}</b>
      </span>
      <span className="text-muted-foreground">
        Vitesse <b className="text-foreground">{fmtVelocity(row.velocityPerDay)}</b>
      </span>
      <span className="text-muted-foreground">
        Reste <b className="text-foreground">{fmtDaysLeft(row.daysLeft)}</b>
      </span>
    </div>
  );
}

function OOSActions({
  row,
  pending,
  onRupture,
  onRestock,
}: {
  row: StockRow;
  pending: boolean;
  onRupture: () => void;
  onRestock: () => void;
}) {
  const oos = row.status === "RUPTURE";
  return oos ? (
    <Button size="sm" variant="outline" disabled={pending} onClick={onRestock}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
      Réappro
    </Button>
  ) : (
    <Button size="sm" variant="destructive" disabled={pending} onClick={onRupture}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <PackageX className="size-4" />}
      Rupture
    </Button>
  );
}

function HeroCard({
  row,
  pending,
  onRupture,
  onRestock,
  onConfig,
  onToggleHero,
}: {
  row: StockRow;
  pending: boolean;
  onRupture: () => void;
  onRestock: () => void;
  onConfig: () => void;
  onToggleHero: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title ?? row.sku}</p>
          <p className="text-muted-foreground font-mono text-xs">{row.sku}</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="text-amber"
          disabled={pending}
          aria-label="Retirer des phares"
          onClick={onToggleHero}
        >
          <Star className="size-4 fill-current" />
        </Button>
      </div>
      <Metrics row={row} />
      <div className="flex items-center gap-2">
        <OOSActions row={row} pending={pending} onRupture={onRupture} onRestock={onRestock} />
        <Button size="sm" variant="ghost" onClick={onConfig} aria-label="Réglages réappro">
          <Settings2 className="size-4" />
          Seuils
        </Button>
      </div>
    </div>
  );
}

function ReorderRow({
  row,
  pending,
  onRupture,
  onRestock,
  onToggleHero,
}: {
  row: StockRow;
  pending: boolean;
  onRupture: () => void;
  onRestock: () => void;
  onToggleHero: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{row.title ?? row.sku}</span>
          <span className="text-muted-foreground font-mono text-xs">{row.sku}</span>
        </div>
        <div className="mt-1">
          <Metrics row={row} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          disabled={pending}
          aria-label="Marquer comme phare"
          onClick={onToggleHero}
        >
          <Star className="size-4" />
        </Button>
        <OOSActions row={row} pending={pending} onRupture={onRupture} onRestock={onRestock} />
      </div>
    </div>
  );
}

function RestockDialog({
  row,
  onOpenChange,
  onDone,
}: {
  row: StockRow;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [qty, setQty] = React.useState(String(Math.max(10, row.inventoryQty)));
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const n = parseInt(qty, 10);
    if (Number.isNaN(n) || n < 0) {
      toast.warning("Quantité invalide");
      return;
    }
    setBusy(true);
    try {
      const r = await setStockAction([row.id], "restock", n);
      if (r.ok) {
        toast.success(`${row.title ?? row.sku} réapprovisionné (${n})`);
        onDone();
      } else toast.error(r.message ?? "Échec");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réapprovisionner</DialogTitle>
          <DialogDescription>
            Nouvelle quantité en stock pour {row.title ?? row.sku}.
          </DialogDescription>
        </DialogHeader>
        <Input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({
  row,
  onOpenChange,
  onDone,
}: {
  row: StockRow;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [threshold, setThreshold] = React.useState(
    row.reorderThreshold != null ? String(row.reorderThreshold) : ""
  );
  const [lead, setLead] = React.useState(
    row.leadTimeDays != null ? String(row.leadTimeDays) : ""
  );
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      const t = threshold.trim() === "" ? null : parseInt(threshold, 10);
      const l = lead.trim() === "" ? null : parseInt(lead, 10);
      const r = await setReorderConfigAction(row.id, t, l);
      if (r.ok) {
        toast.success("Seuils enregistrés");
        onDone();
      } else toast.error(r.message ?? "Échec");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seuils de réapprovisionnement</DialogTitle>
          <DialogDescription>
            Pour {row.title ?? row.sku}. L&apos;alerte se déclenche quand le stock
            restant ne couvre plus le délai de réappro.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground">Seuil stock bas (unités)</span>
            <Input
              type="number"
              min={0}
              placeholder="défaut : 5"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Délai de réappro (jours)</span>
            <Input
              type="number"
              min={0}
              placeholder="défaut : 21"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
