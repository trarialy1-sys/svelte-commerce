"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import {
  addNoteAction,
  addTagAction,
  removeTagAction,
  setBlockedAction,
  updateContactAction,
} from "../actions";

interface Customer {
  id: string;
  name: string;
  phone: string;
  phoneDisplay: string;
  city: string | null;
  tags: string[];
  isBlocked: boolean;
  blockedReason: string | null;
}
interface Kpis {
  ordersCount: number;
  delivered: number;
  returned: number;
  returnRate: number;
  lastOrderAt: string | null;
  codDelivered?: number;
  avgOrderValue?: number;
}
interface OrderRow {
  id: string;
  code: string;
  status: string;
  parcelStatus: string | null;
  totalPrice: number;
  createdAt: string;
}
interface NoteRow {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

const ORDER_TONES: Record<string, string> = {
  NOUVELLE: "blue",
  CONFIRMEE: "green",
  ANNULEE: "red",
  REPORTEE: "amber",
  PAS_DE_REPONSE: "amber",
  INJOIGNABLE: "amber",
  NUMERO_ERRONE: "red",
  DOUBLON: "violet",
  HORS_ZONE: "neutral",
};
const PARCEL_TONES: Record<string, string> = {
  CREE: "blue",
  RAMASSE: "blue",
  EN_TRANSIT: "amber",
  LIVRE: "green",
  RETOURNE: "red",
  REFUSE: "red",
};

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

export function CustomerDetail({
  customer,
  kpis,
  orders,
  notes,
  canEdit,
}: {
  customer: Customer;
  kpis: Kpis;
  orders: OrderRow[];
  notes: NoteRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [note, setNote] = React.useState("");
  const [newTag, setNewTag] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [editName, setEditName] = React.useState(customer.name);
  const [editCity, setEditCity] = React.useState(customer.city ?? "");
  const [blockReason, setBlockReason] = React.useState("");

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(ok);
        router.refresh();
      } else {
        toast.error(res.message ?? "Action refusée.");
      }
    });
  }

  const showMoney = kpis.codDelivered !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/customers"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Clients
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            {customer.isBlocked ? (
              <StatusBadge status="blocked" tone={"red" as never} label="Bloqué" />
            ) : null}
          </div>
          <p className="text-muted-foreground font-mono text-sm">{customer.phoneDisplay}</p>
          {customer.city ? (
            <p className="text-muted-foreground text-sm">{customer.city}</p>
          ) : null}
          {customer.isBlocked && customer.blockedReason ? (
            <p className="text-destructive text-sm">Motif : {customer.blockedReason}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {customer.tags.map((t) => (
              <span
                key={t}
                className="bg-accent text-accent-foreground inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
              >
                {t}
                {canEdit ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => removeTagAction({ customerId: customer.id, tag: t }),
                        "Tag retiré."
                      )
                    }
                    className="hover:text-destructive"
                    aria-label={`Retirer ${t}`}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {canEdit ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTag.trim()) return;
                  run(
                    () => addTagAction({ customerId: customer.id, tag: newTag }),
                    "Tag ajouté."
                  );
                  setNewTag("");
                }}
                className="inline-flex"
              >
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="+ tag"
                  disabled={pending}
                  className="border-input h-6 w-20 rounded border bg-transparent px-1.5 text-xs outline-none focus:w-28"
                />
              </form>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Modifier
            </Button>
            {customer.isBlocked ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setBlockedAction({ customerId: customer.id, blocked: false }),
                    "Client débloqué."
                  )
                }
              >
                <ShieldCheck className="size-4" /> Débloquer
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBlockOpen(true)}
              >
                <Ban className="size-4" /> Bloquer
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Kpi label="Commandes" value={formatNumber(kpis.ordersCount)} />
        <Kpi label="Livrées" value={formatNumber(kpis.delivered)} tone="text-green" />
        <Kpi
          label="Retours / refus"
          value={formatNumber(kpis.returned)}
          tone={kpis.returned > 0 ? "text-destructive" : undefined}
        />
        <Kpi
          label="Taux de retour"
          value={`${kpis.returnRate}%`}
          tone={kpis.returnRate >= 30 ? "text-destructive" : undefined}
        />
        <Kpi
          label="Dernière commande"
          value={kpis.lastOrderAt ? formatDate(kpis.lastOrderAt) : "—"}
        />
        {showMoney ? (
          <>
            <Kpi
              label="COD livré (à encaisser)"
              value={formatMoney(kpis.codDelivered)}
              tone="text-green"
            />
            <Kpi label="Panier moyen" value={formatMoney(kpis.avgOrderValue)} />
          </>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Order history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historique des commandes</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Aucune commande.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                    <Link
                      href={`/orders?q=${encodeURIComponent(o.code)}`}
                      className="font-mono hover:underline"
                    >
                      {o.code}
                    </Link>
                    <StatusBadge
                      status={o.status}
                      tone={(ORDER_TONES[o.status] ?? "neutral") as never}
                      label={o.status}
                    />
                    {o.parcelStatus ? (
                      <StatusBadge
                        status={o.parcelStatus}
                        tone={(PARCEL_TONES[o.parcelStatus] ?? "neutral") as never}
                        label={o.parcelStatus}
                      />
                    ) : null}
                    <span className="ml-auto font-mono tabular-nums">
                      {formatMoney(o.totalPrice)}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatDate(o.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {canEdit ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  run(
                    () => addNoteAction({ customerId: customer.id, body: note }),
                    "Note ajoutée."
                  );
                  setNote("");
                }}
                className="flex flex-col gap-2"
              >
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ajouter une note…"
                  rows={2}
                  disabled={pending}
                />
                <Button type="submit" size="sm" className="self-end" disabled={pending}>
                  <Plus className="size-4" /> Ajouter
                </Button>
              </form>
            ) : null}
            {notes.length === 0 ? (
              <p className="text-muted-foreground py-2 text-center text-sm">
                Aucune note.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {notes.map((n) => (
                  <li key={n.id} className="border-l-2 pl-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {n.author} · {formatDateTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit contact dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le contact</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="c-name">Nom</Label>
              <Input id="c-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-city">Ville</Label>
              <Input id="c-city" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              disabled={pending}
              onClick={() => {
                setEditOpen(false);
                run(
                  () =>
                    updateContactAction({
                      customerId: customer.id,
                      name: editName,
                      city: editCity || null,
                    }),
                  "Contact mis à jour."
                );
              }}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block dialog */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquer le client</DialogTitle>
            <DialogDescription>
              Le client sera signalé comme bloqué (l&apos;avertissement à la
              confirmation arrive plus tard).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="b-reason">Motif (optionnel)</Label>
            <Input
              id="b-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="ex. retours répétés"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setBlockOpen(false);
                run(
                  () =>
                    setBlockedAction({
                      customerId: customer.id,
                      blocked: true,
                      reason: blockReason,
                    }),
                  "Client bloqué."
                );
                setBlockReason("");
              }}
            >
              Bloquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
