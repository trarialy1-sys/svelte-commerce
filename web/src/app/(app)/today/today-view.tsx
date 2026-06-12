"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  PhoneCall,
  Send,
  Truck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BLResult } from "@/lib/shipping/bl";
import { shipBatchAction, type ShipBatchResult } from "./actions";

/** A confirmed order with no parcel yet — the only thing this board acts on. */
export interface ReadyOrder {
  id: string;
  code: string;
  customer: string;
  cityRaw: string;
  total: number;
  /** ISO confirmation day — decides which daily batch this belongs to. */
  dayAt: string;
  /** City is resolved or confidently auto-detectable (else needs a fix). */
  cityOk: boolean;
}

interface DayBatch {
  key: string;
  label: string;
  isToday: boolean;
  orders: ReadyOrder[];
  needCity: number;
  total: number;
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Bucket the ready orders into one card per confirmation day. */
function groupByDay(orders: ReadyOrder[]): DayBatch[] {
  const tk = localKey(new Date());
  const map = new Map<string, DayBatch>();
  for (const o of orders) {
    const d = new Date(o.dayAt);
    const key = Number.isNaN(d.getTime()) ? "—" : localKey(d);
    let batch = map.get(key);
    if (!batch) {
      const label = Number.isNaN(d.getTime()) ? "Sans date" : DAY_FMT.format(d);
      batch = {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        isToday: key === tk,
        orders: [],
        needCity: 0,
        total: 0,
      };
      map.set(key, batch);
    }
    batch.orders.push(o);
    batch.total += o.total;
    if (!o.cityOk) batch.needCity++;
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

export function TodayView({
  ready,
  toConfirmCount,
  shippedToday,
  role,
}: {
  ready: ReadyOrder[];
  toConfirmCount: number;
  shippedToday: number;
  role: AppRole | null;
}) {
  const router = useRouter();
  const canWrite = meetsOrgRole(role, "operator");

  const batches = React.useMemo(() => groupByDay(ready), [ready]);

  const [confirm, setConfirm] = React.useState<DayBatch | null>(null);
  const [stock, setStock] = React.useState(0);
  const [shipping, setShipping] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Record<string, ShipBatchResult>>({});

  async function runShip() {
    if (!confirm) return;
    const batch = confirm;
    setShipping(true);
    try {
      const r = await shipBatchAction(
        batch.orders.map((o) => o.id),
        stock
      );
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      const d = r.data;
      setOutcome((prev) => ({ ...prev, [batch.key]: d }));
      if (d.bl) {
        toast.success(
          `Lot expédié : ${d.sent} colis · BL ${d.bl.ref}${
            d.failed > 0 ? ` · ${d.failed} échec(s)` : ""
          }`
        );
      } else if (d.blError) {
        toast.error(`Colis créés mais BL en échec : ${d.blError}`);
      } else {
        toast.warning(`${d.failed} échec(s) — aucun colis à grouper.`);
      }
      setConfirm(null);
      router.refresh();
    } finally {
      setShipping(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Lot du jour"
        subtitle="Les commandes confirmées prêtes à partir — expédiez tout un lot et son BL en un clic."
      />

      {/* Pipeline at a glance — counts only, real work links to its page. */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/orders"
          className="hover:bg-accent flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <PhoneCall className="text-blue size-4" />
          <span className="text-muted-foreground">À confirmer</span>
          <b>{toConfirmCount}</b>
        </Link>
        <span className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <Truck className="text-amber size-4" />
          <span className="text-muted-foreground">Prêt à expédier</span>
          <b>{ready.length}</b>
        </span>
        <span className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <CheckCircle2 className="text-green size-4" />
          <span className="text-muted-foreground">Expédiées aujourd&apos;hui</span>
          <b>{shippedToday}</b>
        </span>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucune commande prête à expédier"
          message="Confirmez des commandes dans Commandes — elles apparaîtront ici, prêtes à partir."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {batches.map((batch) => (
            <BatchCard
              key={batch.key}
              batch={batch}
              canWrite={canWrite}
              outcome={outcome[batch.key]}
              onShip={() => {
                setStock(0);
                setConfirm(batch);
              }}
            />
          ))}
        </div>
      )}

      <ConfirmShipDialog
        batch={confirm}
        stock={stock}
        setStock={setStock}
        shipping={shipping}
        onOpenChange={(open) => {
          if (!open && !shipping) setConfirm(null);
        }}
        onConfirm={runShip}
      />
    </>
  );
}

function BatchCard({
  batch,
  canWrite,
  outcome,
  onShip,
}: {
  batch: DayBatch;
  canWrite: boolean;
  outcome?: ShipBatchResult;
  onShip: () => void;
}) {
  return (
    <section className="rounded-xl border">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <CalendarDays className="text-muted-foreground size-4" />
        <h2 className="font-semibold">{batch.label}</h2>
        {batch.isToday ? (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
            Aujourd&apos;hui
          </span>
        ) : null}
        <span className="text-muted-foreground text-sm">
          {batch.orders.length} colis · {formatMoney(batch.total)}
        </span>
        {batch.needCity > 0 ? (
          <Link
            href="/shipping"
            className="text-destructive inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            <TriangleAlert className="size-3.5" />
            {batch.needCity} ville(s) à corriger
          </Link>
        ) : null}
        {canWrite ? (
          <Button size="sm" className="ml-auto" onClick={onShip}>
            <Send className="size-4" />
            Expédier + BL ({batch.orders.length})
          </Button>
        ) : null}
      </header>

      <ul className="divide-y">
        {batch.orders.map((o) => (
          <li
            key={o.id}
            className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{o.customer}</span>
              <span className="text-muted-foreground ml-2 font-mono text-xs">
                {o.code}
              </span>
            </div>
            <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1">
                {!o.cityOk ? (
                  <TriangleAlert className="text-destructive size-3.5" />
                ) : null}
                {o.cityRaw || "ville ?"}
              </span>
              <span className="text-foreground">{formatMoney(o.total)}</span>
            </div>
          </li>
        ))}
      </ul>

      {outcome ? <ShipOutcome outcome={outcome} /> : null}
    </section>
  );
}

function ShipOutcome({ outcome }: { outcome: ShipBatchResult }) {
  // Blocked (no real Ozon city) is kept separate from genuine API failures.
  const blocked = outcome.results.filter((r) => r.blocked);
  const failures = outcome.results.filter((r) => !r.ok && !r.usedBefore && !r.blocked);
  return (
    <div className="bg-muted/30 flex flex-col gap-2 border-t px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">
          {outcome.sent} expédiée(s)
          {blocked.length > 0 ? ` · ${blocked.length} bloquée(s)` : ""}
          {failures.length > 0 ? ` · ${failures.length} échec(s)` : ""}
          {outcome.citiesResolved > 0
            ? ` · ${outcome.citiesResolved} ville(s) auto`
            : ""}
        </span>
        {outcome.bl ? <BLLinks bl={outcome.bl} /> : null}
      </div>
      {outcome.blError ? (
        <p className="text-destructive text-xs">BL : {outcome.blError}</p>
      ) : null}
      {blocked.length > 0 ? (
        <div className="text-amber flex flex-col gap-1 text-xs">
          <span className="inline-flex items-center gap-1 font-medium">
            <TriangleAlert className="size-3.5" />
            Bloquées — ville introuvable chez Ozon :
          </span>
          {blocked.map((b) => (
            <span key={b.orderId} className="text-muted-foreground">
              <span className="font-mono">{b.code}</span> — {b.error}
            </span>
          ))}
          <Link href="/shipping" className="font-medium underline">
            Corriger les villes dans Livraisons →
          </Link>
        </div>
      ) : null}
      {failures.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {failures.map((f) => (
            <li key={f.orderId} className="text-destructive text-xs">
              <span className="font-mono">{f.code}</span> — {f.error}
            </li>
          ))}
          <li className="text-muted-foreground text-xs">
            Corrigez les échecs dans{" "}
            <Link href="/shipping" className="font-medium underline">
              Livraisons
            </Link>
            .
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function ConfirmShipDialog({
  batch,
  stock,
  setStock,
  shipping,
  onOpenChange,
  onConfirm,
}: {
  batch: DayBatch | null;
  stock: number;
  setStock: (s: number) => void;
  shipping: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={batch !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Expédier le lot ?</DialogTitle>
          <DialogDescription>
            Crée {batch?.orders.length ?? 0} colis RÉELS chez OzonExpress (coût
            réel) et génère un seul Bon de Livraison pour le lot
            {batch ? ` « ${batch.label} »` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Mode :</span>
            <Button
              size="sm"
              variant={stock === 0 ? "default" : "outline"}
              onClick={() => setStock(0)}
            >
              Ramassage
            </Button>
            <Button
              size="sm"
              variant={stock === 1 ? "default" : "outline"}
              onClick={() => setStock(1)}
            >
              Stock
            </Button>
          </div>
          {batch && batch.needCity > 0 ? (
            <p className="text-destructive flex items-center gap-1.5 text-xs">
              <TriangleAlert className="size-3.5" />
              {batch.needCity} commande(s) sans ville Ozon valide seront
              bloquées (non expédiées) — corrigez-les dans Livraisons.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={shipping} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={shipping} onClick={onConfirm}>
            {shipping ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Expédier {batch?.orders.length ?? 0} colis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BLLinks({ bl }: { bl: BLResult }) {
  return (
    <span className="inline-flex items-center gap-3 text-sm">
      <span className="font-mono font-medium">{bl.ref}</span>
      <a
        href={bl.pdfUrl}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 font-medium"
      >
        <FileText className="size-4" /> PDF BL
      </a>
      <a
        href={bl.labelsUrl}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 font-medium"
      >
        <ExternalLink className="size-4" /> Étiquettes
      </a>
    </span>
  );
}
