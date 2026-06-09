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

export interface TodayOrder {
  id: string;
  code: string;
  customer: string;
  phone: string;
  cityRaw: string;
  total: number;
  /** ISO timestamp — the order's import day decides its batch. */
  createdAt: string;
  bucket: "toConfirm" | "ready" | "shipped";
  /** Ready orders only: city is resolved or confidently auto-detectable. */
  cityOk: boolean;
  tracking: string | null;
}

interface DayBatch {
  key: string;
  label: string;
  isToday: boolean;
  toConfirm: TodayOrder[];
  ready: TodayOrder[];
  shipped: TodayOrder[];
  /** Ready orders whose city still needs a manual fix. */
  needCity: number;
  total: number;
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Local (operator timezone) YYYY-MM-DD key + a human label. */
function dayOf(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { key: "—", label: "Sans date" };
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const label = DAY_FMT.format(d);
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Bucket every order into its day, then split each day into the 3 columns. */
function groupByDay(orders: TodayOrder[]): DayBatch[] {
  const tk = todayKey();
  const map = new Map<string, DayBatch>();
  for (const o of orders) {
    const { key, label } = dayOf(o.createdAt);
    let batch = map.get(key);
    if (!batch) {
      batch = {
        key,
        label,
        isToday: key === tk,
        toConfirm: [],
        ready: [],
        shipped: [],
        needCity: 0,
        total: 0,
      };
      map.set(key, batch);
    }
    if (o.bucket === "toConfirm") batch.toConfirm.push(o);
    else if (o.bucket === "ready") {
      batch.ready.push(o);
      batch.total += o.total;
      if (!o.cityOk) batch.needCity++;
    } else batch.shipped.push(o);
  }
  // Most recent day first.
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

export function TodayView({
  orders,
  role,
}: {
  orders: TodayOrder[];
  role: AppRole | null;
}) {
  const router = useRouter();
  const canWrite = meetsOrgRole(role, "operator");

  const batches = React.useMemo(() => groupByDay(orders), [orders]);

  const [confirm, setConfirm] = React.useState<DayBatch | null>(null);
  const [stock, setStock] = React.useState(0);
  const [shipping, setShipping] = React.useState(false);
  // Per-day outcome of the last ship (BL links + any failures), keyed by day.
  const [outcome, setOutcome] = React.useState<
    Record<string, ShipBatchResult>
  >({});

  async function runShip() {
    if (!confirm) return;
    const batch = confirm;
    const ids = batch.ready.map((o) => o.id);
    setShipping(true);
    try {
      const r = await shipBatchAction(ids, stock);
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
        subtitle="Chaque jour est un lot : confirmez, puis expédiez tout en un clic (colis + BL)."
      />

      {batches.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucun lot en cours"
          message="Importez des commandes pour démarrer le lot du jour."
        />
      ) : (
        <div className="flex flex-col gap-5">
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
          {batch.ready.length} prêt(s) · {formatMoney(batch.total)}
        </span>
        {canWrite && batch.ready.length > 0 ? (
          <Button size="sm" className="ml-auto" onClick={onShip}>
            <Send className="size-4" />
            Expédier + BL ({batch.ready.length})
          </Button>
        ) : null}
      </header>

      <div className="grid gap-px sm:grid-cols-3">
        <Column
          title="À confirmer"
          icon={PhoneCall}
          tone="text-blue"
          orders={batch.toConfirm}
          emptyHint="Rien à appeler."
          footer={
            batch.toConfirm.length > 0 ? (
              <Link
                href="/orders"
                className="text-primary text-xs font-medium hover:underline"
              >
                Confirmer dans Commandes →
              </Link>
            ) : null
          }
        />
        <Column
          title="Prêt à expédier"
          icon={Truck}
          tone="text-amber"
          orders={batch.ready}
          emptyHint="Aucune commande prête."
          footer={
            batch.needCity > 0 ? (
              <Link
                href="/shipping"
                className="text-destructive inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                <TriangleAlert className="size-3.5" />
                {batch.needCity} ville(s) à corriger →
              </Link>
            ) : null
          }
        />
        <Column
          title="Expédiées"
          icon={CheckCircle2}
          tone="text-green"
          orders={batch.shipped}
          emptyHint="Pas encore expédiées."
        />
      </div>

      {outcome ? <ShipOutcome outcome={outcome} /> : null}
    </section>
  );
}

function Column({
  title,
  icon: Icon,
  tone,
  orders,
  emptyHint,
  footer,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  orders: TodayOrder[];
  emptyHint: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-background flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className={`size-4 ${tone}`} />
        {title}
        <span className="text-muted-foreground">({orders.length})</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-muted-foreground py-2 text-xs">{emptyHint}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {orders.map((o) => (
            <li
              key={o.id}
              className="bg-muted/40 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{o.customer}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatMoney(o.total)}
                </span>
              </div>
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span className="font-mono">{o.code}</span>
                {o.tracking ? (
                  <span className="font-mono">· {o.tracking}</span>
                ) : (
                  <span>· {o.cityRaw || "ville ?"}</span>
                )}
                {o.bucket === "ready" && !o.cityOk ? (
                  <TriangleAlert className="text-destructive size-3" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {footer ? <div className="mt-auto pt-1">{footer}</div> : null}
    </div>
  );
}

function ShipOutcome({ outcome }: { outcome: ShipBatchResult }) {
  const failures = outcome.results.filter((r) => !r.ok && !r.usedBefore);
  return (
    <div className="bg-muted/30 flex flex-col gap-2 border-t px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">
          {outcome.sent} expédiée(s)
          {outcome.failed > 0 ? ` · ${outcome.failed} échec(s)` : ""}
          {outcome.citiesResolved > 0
            ? ` · ${outcome.citiesResolved} ville(s) auto`
            : ""}
        </span>
        {outcome.bl ? <BLLinks bl={outcome.bl} /> : null}
      </div>
      {outcome.blError ? (
        <p className="text-destructive text-xs">BL : {outcome.blError}</p>
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
            Crée {batch?.ready.length ?? 0} colis RÉELS chez OzonExpress (coût
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
              {batch.needCity} commande(s) sans ville confirmée pourraient
              échouer — vous pourrez les corriger ensuite dans Livraisons.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={shipping}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button disabled={shipping} onClick={onConfirm}>
            {shipping ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Expédier {batch?.ready.length ?? 0} colis
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
