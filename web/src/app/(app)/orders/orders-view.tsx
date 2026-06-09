"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FileText,
  Loader2,
  PackageX,
  ShoppingBag,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { formatDate, formatMoney } from "@/lib/format";
import type { Row } from "@/lib/module/types";
import { DataTable } from "@/components/module/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ordersConfig,
  ordersConfirmedConfig,
  ordersReadyConfig,
  ordersToConfirmConfig,
  STATUS_LABELS,
} from "@/modules/orders/config";
import {
  getOrderCountsAction,
  getOrderDetailAction,
  importExcelAction,
  importShopifyAction,
  removeItemAction,
  removeOosAction,
  setStatusAction,
  updateOrderFieldAction,
} from "./actions";

/** Columns an operator can edit inline in the grid. */
const EDITABLE_COLUMNS = new Set(["phone", "cityRaw", "address"]);

/** Whole-row tint by status (and purple for out-of-stock / empty orders). */
const STATUS_ROW_TINT: Record<string, string> = {
  CONFIRMEE: "bg-orange-soft", // confirmée → orange
  REPORTEE: "bg-yellow-soft", // reportée → jaune
  ANNULEE: "bg-destructive/10", // annulée → rouge
  DOUBLON: "bg-muted", // doublon / fausse commande → gris
  PAS_DE_REPONSE: "bg-blue-soft",
  INJOIGNABLE: "bg-amber-soft",
  NUMERO_ERRONE: "bg-destructive/10",
  HORS_ZONE: "bg-muted",
  // NOUVELLE → no tint (default)
};

function rowTint(row: Row): string | undefined {
  // Out of stock / no shippable item → purple, takes precedence.
  if (Number(row.itemsCount) === 0) return "bg-violet-soft";
  return STATUS_ROW_TINT[String(row.status)];
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Group the Confirmées rows by their confirmation day (local). */
function confirmedDayGroup(row: Row): { key: string; label: string } | null {
  const raw = row.confirmedAt ?? row.createdAt;
  if (!raw) return { key: "—", label: "Sans date" };
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { key: "—", label: "Sans date" };
  const key = d.toISOString().slice(0, 10);
  const label = DAY_FMT.format(d);
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
}
import type { OrderDetail } from "@/lib/orders/remake";

/** Confirmation outcomes available in the per-row dropdown. */
const OUTCOMES: { status: string; label: string }[] = [
  { status: "CONFIRMEE", label: STATUS_LABELS.CONFIRMEE },
  { status: "REPORTEE", label: STATUS_LABELS.REPORTEE },
  { status: "PAS_DE_REPONSE", label: STATUS_LABELS.PAS_DE_REPONSE },
  { status: "INJOIGNABLE", label: STATUS_LABELS.INJOIGNABLE },
  { status: "NUMERO_ERRONE", label: STATUS_LABELS.NUMERO_ERRONE },
  { status: "DOUBLON", label: STATUS_LABELS.DOUBLON },
  { status: "HORS_ZONE", label: STATUS_LABELS.HORS_ZONE },
  { status: "ANNULEE", label: STATUS_LABELS.ANNULEE },
];

export function OrdersView({ role }: { role: AppRole | null }) {
  const canWrite = meetsOrgRole(role, "operator");
  const queryClient = useQueryClient();
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [reportFor, setReportFor] = React.useState<string | null>(null);

  const refreshAll = React.useCallback(() => {
    for (const key of [
      "orders",
      "orders_confirm",
      "orders_confirmed",
      "orders_ready",
      "order-counts",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  const { data: counts } = useQuery({
    queryKey: ["order-counts"],
    queryFn: async () => {
      const r = await getOrderCountsAction();
      return r.ok ? r.data : null;
    },
  });
  const n = (v: number | undefined) => (v == null ? "" : ` (${v})`);

  const applyStatus = React.useCallback(
    async (orderId: string, status: string, callbackAt?: string) => {
      const r = await setStatusAction(orderId, status, { callbackAt });
      if (r.ok) {
        toast.success("Statut mis à jour");
        refreshAll();
      } else {
        toast.error(r.message);
      }
    },
    [refreshAll]
  );

  const renderRowActions = canWrite
    ? (row: Row) => (
        <StatusMenu
          onPick={(status) => {
            if (status === "REPORTEE") setReportFor(String(row.id));
            else applyStatus(String(row.id), status);
          }}
        />
      )
    : undefined;

  const onCellSave = React.useCallback(
    async (rowId: string, field: string, value: string): Promise<boolean> => {
      const r = await updateOrderFieldAction(rowId, field, value);
      if (r.ok) {
        toast.success("Commande mise à jour");
        refreshAll();
        return true;
      }
      toast.error(r.message);
      return false;
    },
    [refreshAll]
  );

  const tableProps = {
    role,
    dense: true,
    onRowClick: (row: Row) => setDetailId(String(row.id)),
    renderRowActions,
    editableFields: canWrite ? EDITABLE_COLUMNS : undefined,
    onCellSave: canWrite ? onCellSave : undefined,
    rowClassName: rowTint,
  };

  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle="Import, confirmation et préparation des commandes."
        actions={canWrite ? <ImportBar onDone={refreshAll} /> : null}
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Toutes{n(counts?.all)}</TabsTrigger>
          <TabsTrigger value="confirm">
            À confirmer{n(counts?.toConfirm)}
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            Confirmées{n(counts?.confirmed)}
          </TabsTrigger>
          <TabsTrigger value="ready">
            Prêt à expédier{n(counts?.ready)}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <DataTable config={ordersConfig} {...tableProps} />
        </TabsContent>
        <TabsContent value="confirm">
          <DataTable config={ordersToConfirmConfig} {...tableProps} />
        </TabsContent>
        <TabsContent value="confirmed">
          <DataTable
            config={ordersConfirmedConfig}
            {...tableProps}
            groupBy={confirmedDayGroup}
          />
        </TabsContent>
        <TabsContent value="ready">
          <DataTable config={ordersReadyConfig} {...tableProps} />
        </TabsContent>
      </Tabs>

      <OrderDetailSheet
        orderId={detailId}
        canWrite={canWrite}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onChanged={refreshAll}
      />

      <ReportDialog
        key={reportFor ?? "none"}
        open={reportFor !== null}
        onOpenChange={(open) => {
          if (!open) setReportFor(null);
        }}
        onConfirm={(date) => {
          if (reportFor) applyStatus(reportFor, "REPORTEE", date);
          setReportFor(null);
        }}
      />
    </>
  );
}

function StatusMenu({ onPick }: { onPick: (status: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          Statut
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OUTCOMES.map((o) => (
          <React.Fragment key={o.status}>
            {o.status === "ANNULEE" ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={o.status === "ANNULEE" ? "destructive" : "default"}
              onSelect={() => onPick(o.status)}
            >
              {o.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string) => void;
}) {
  const [date, setDate] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reporter la commande</DialogTitle>
          <DialogDescription>
            Choisissez la date de rappel du client.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!date} onClick={() => onConfirm(date)}>
            Reporter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportBar({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<"excel" | "shopify" | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPending("excel");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await importExcelAction(fd);
      if (r.ok) {
        toast.success(
          `${r.data.created} importée(s), ${r.data.skipped} ignorée(s)`
        );
        onDone();
        router.refresh();
      } else toast.error(r.message);
    } finally {
      setPending(null);
    }
  }

  async function importShopify() {
    setPending("shopify");
    try {
      const r = await importShopifyAction();
      if (r.ok) {
        toast.success(
          `${r.data.created} importée(s), ${r.data.skipped} ignorée(s)`
        );
        onDone();
        router.refresh();
      } else toast.error(r.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onFile}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending !== null}
        onClick={() => fileRef.current?.click()}
      >
        {pending === "excel" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        Importer Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending !== null}
        onClick={importShopify}
      >
        {pending === "shopify" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ShoppingBag className="size-4" />
        )}
        Importer Shopify
      </Button>
    </div>
  );
}

function OrderDetailSheet({
  orderId,
  canWrite,
  onOpenChange,
  onChanged,
}: {
  orderId: string | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  const { data: detail, isLoading: loading, refetch } = useQuery({
    queryKey: ["order-detail", orderId],
    enabled: orderId !== null,
    queryFn: async (): Promise<OrderDetail | null> => {
      if (!orderId) return null;
      const r = await getOrderDetailAction(orderId);
      return r.ok ? r.data : null;
    },
  });

  async function removeItem(itemId: string) {
    if (!orderId) return;
    setBusy(true);
    try {
      const r = await removeItemAction(orderId, itemId);
      if (r.ok) {
        toast.success("Article retiré");
        await refetch();
        onChanged();
      } else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeOos() {
    if (!orderId) return;
    setBusy(true);
    try {
      const r = await removeOosAction(orderId);
      if (r.ok) {
        toast.success(`${r.data.removed} article(s) en rupture retiré(s)`);
        await refetch();
        onChanged();
      } else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  const hasOos = (detail?.items ?? []).some((i) => i.outOfStock);

  return (
    <Sheet open={orderId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {detail ? detail.code : loading ? "Chargement…" : "Commande"}
          </SheetTitle>
          <SheetDescription>
            {detail ? (
              <StatusBadge status={detail.status} />
            ) : (
              "Détail de la commande"
            )}
          </SheetDescription>
        </SheetHeader>

        {detail ? (
          <div className="flex flex-col gap-5 px-4 pb-4">
            {canWrite ? (
              <Button asChild variant="outline" size="sm" className="self-start">
                <a
                  href={`/api/orders/${orderId}/pdf?type=packing`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="size-4" />
                  Bon de préparation
                </a>
              </Button>
            ) : null}
            <section className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Client" value={detail.customer?.name ?? "—"} />
              <Field label="Téléphone" value={detail.phone ?? "—"} />
              <Field label="Ville" value={detail.cityRaw ?? "—"} />
              <Field label="Source" value={detail.source} />
              <Field
                label="Total"
                value={formatMoney(detail.totalPrice)}
              />
              <Field label="Créée le" value={formatDate(detail.createdAt)} />
              {detail.address ? (
                <Field
                  label="Adresse"
                  value={detail.address}
                  className="col-span-2"
                />
              ) : null}
              {detail.note ? (
                <Field
                  label="Note"
                  value={detail.note}
                  className="col-span-2"
                />
              ) : null}
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Articles ({detail.items.length})
                </h3>
                {canWrite && hasOos ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={removeOos}
                  >
                    <PackageX className="size-4" />
                    Retirer ruptures
                  </Button>
                ) : null}
              </div>
              <ul className="flex flex-col divide-y rounded-lg border">
                {detail.items.length === 0 ? (
                  <li className="text-muted-foreground p-3 text-sm">
                    Aucun article.
                  </li>
                ) : (
                  detail.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {item.title ?? item.sku}
                        </p>
                        <p className="text-muted-foreground font-mono text-xs">
                          {item.sku} · ×{item.qty} ·{" "}
                          {formatMoney(item.unitPrice)}
                        </p>
                      </div>
                      {item.outOfStock ? (
                        <StatusBadge
                          status="RUPTURE"
                          tone="red"
                          label="Rupture"
                        />
                      ) : null}
                      {canWrite ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label="Retirer l'article"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
