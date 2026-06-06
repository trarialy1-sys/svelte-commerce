"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ParcelResult } from "@/lib/shipping/ozon";
import type { BLResult } from "@/lib/shipping/bl";
import {
  buildBLOnlyAction,
  createDeliveryNoteAction,
  retryOneAction,
  saveCityPickAction,
  saveCityPicksAction,
  sendParcelsAction,
} from "./actions";

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
export interface DeliveryNoteRow {
  id: string;
  ref: string;
  parcelCount: number;
  pdfUrl: string | null;
  labelsUrl: string | null;
  createdAt: string;
}

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
  approx: "Proche",
  guess: "À vérifier",
  none: "À corriger",
};
const METHOD_TONE: Record<string, "green" | "blue" | "amber" | "red"> = {
  saved: "green",
  alias: "green",
  exact: "green",
  casa: "blue",
  fuzzy: "amber",
  approx: "amber",
  guess: "red",
  none: "red",
};
/** High-confidence methods eligible for one-click bulk save. */
const CONFIDENT = new Set(["alias", "exact", "casa", "fuzzy"]);

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
    <div className="relative w-full sm:w-64">
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <input
        className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px]"
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
  notes,
  role,
  cityCount,
}: {
  rows: ShippingRow[];
  cities: CityRow[];
  notes: DeliveryNoteRow[];
  role: AppRole | null;
  cityCount: number;
}) {
  const router = useRouter();
  const canWrite = meetsOrgRole(role, "operator");

  const [picks, setPicks] = React.useState<Record<string, CityRow>>({});
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [stock, setStock] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [results, setResults] = React.useState<ParcelResult[] | null>(null);
  const [retryEdits, setRetryEdits] = React.useState<Record<string, string>>({});
  const [retrying, setRetrying] = React.useState<string | null>(null);
  const [bl, setBl] = React.useState<BLResult | null>(null);
  const [blPending, setBlPending] = React.useState(false);

  function resolvedOf(row: ShippingRow): { id: number; name: string } | null {
    if (picks[row.id]) return picks[row.id];
    if (row.savedCityId != null)
      return { id: row.savedCityId, name: row.suggestedName };
    return null;
  }

  // Bulk auto-save only high-confidence detections; approx/guess need review.
  const detected = rows.filter(
    (r) => !resolvedOf(r) && r.suggestedId != null && CONFIDENT.has(r.method)
  );
  const resolvedCount = rows.filter((r) => resolvedOf(r) != null).length;
  const toFixCount = rows.length - resolvedCount;
  const selectableIds = rows.filter((r) => resolvedOf(r)).map((r) => r.id);
  const selectedResolved = [...selected].filter((id) =>
    selectableIds.includes(id)
  );

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

  async function confirmRow(row: ShippingRow) {
    if (row.suggestedId == null) return;
    await pick(row, { id: row.suggestedId, name: row.suggestedName });
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

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size >= selectableIds.length ? new Set() : new Set(selectableIds)
    );
  }

  async function send() {
    if (selectedResolved.length === 0) return;
    if (
      !window.confirm(
        `Créer ${selectedResolved.length} colis RÉELS chez OzonExpress ? (coût réel)`
      )
    )
      return;
    setSending(true);
    setBl(null);
    try {
      const r = await sendParcelsAction(selectedResolved, stock);
      if (r.ok) {
        setResults(r.data.results);
        const ok = r.data.results.filter((x) => x.ok).length;
        toast.success(`${ok}/${r.data.results.length} colis créés`);
        setSelected(new Set());
      } else toast.error(r.message);
    } finally {
      setSending(false);
    }
  }

  const candidateCodes = React.useMemo(() => {
    if (!results) return [];
    const ok = results.filter((r) => r.ok).map((r) => r.tracking!).filter(Boolean);
    const used = results
      .filter((r) => r.usedBefore)
      .map((r) => r.tracking || r.code)
      .filter(Boolean);
    return [...ok, ...used];
  }, [results]);

  async function retry(res: ParcelResult) {
    setRetrying(res.orderId);
    try {
      const r = await retryOneAction(
        res.orderId,
        stock,
        retryEdits[res.orderId]
      );
      if (r.ok) {
        setResults((prev) =>
          (prev ?? []).map((x) => (x.orderId === res.orderId ? r.data : x))
        );
        toast[r.data.ok ? "success" : "error"](
          r.data.ok ? `Renvoyé : ${r.data.tracking}` : r.data.error ?? "Échec"
        );
      } else toast.error(r.message);
    } finally {
      setRetrying(null);
    }
  }

  async function createBL() {
    if (candidateCodes.length === 0) return;
    if (
      bl &&
      !window.confirm(
        "Un Bon de Livraison a déjà été créé. Cela en crée un NOUVEAU. Continuer ?"
      )
    )
      return;
    setBlPending(true);
    try {
      const r = await createDeliveryNoteAction(candidateCodes);
      if (r.ok) {
        setBl(r.data);
        toast.success(`BL ${r.data.ref} créé`);
        router.refresh();
      } else toast.error(r.message);
    } finally {
      setBlPending(false);
    }
  }

  async function blOnly() {
    const codes = selectedResolved
      .map((id) => rows.find((r) => r.id === id)?.code)
      .filter((c): c is string => Boolean(c));
    if (codes.length === 0) {
      toast.warning("Sélectionnez des commandes déjà existantes chez Ozon.");
      return;
    }
    if (
      !window.confirm(
        `Créer un BL pour ${codes.length} colis DÉJÀ existants (sans renvoyer) ?`
      )
    )
      return;
    setBlPending(true);
    try {
      const r = await buildBLOnlyAction(codes);
      if (r.ok) {
        setBl(r.data);
        toast.success(`BL ${r.data.ref} créé`);
        router.refresh();
      } else toast.error(r.message);
    } finally {
      setBlPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Livraisons & BL"
        subtitle="Corrigez les villes, créez les colis OzonExpress et le Bon de Livraison."
      />

      <Tabs defaultValue="ship">
        <TabsList>
          <TabsTrigger value="ship">À expédier</TabsTrigger>
          <TabsTrigger value="bl">Bons de livraison</TabsTrigger>
        </TabsList>

        <TabsContent value="ship" className="flex flex-col gap-4">
          {cityCount === 0 ? (
            <div className="bg-amber-soft text-amber border-amber/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <TriangleAlert className="size-4" />
              Catalogue des villes non chargé —{" "}
              <Link href="/settings" className="font-semibold underline">
                ouvrir les Réglages
              </Link>
              .
            </div>
          ) : null}

          {/* Stats + bulk city confirm */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground rounded-md border px-2 py-0.5">
              Total <b className="text-foreground">{rows.length}</b>
            </span>
            <span className="text-muted-foreground border-green/40 rounded-md border px-2 py-0.5">
              Résolues <b className="text-foreground">{resolvedCount}</b>
            </span>
            {toFixCount > 0 ? (
              <span className="text-muted-foreground border-destructive/40 rounded-md border px-2 py-0.5">
                À corriger <b className="text-foreground">{toFixCount}</b>
              </span>
            ) : null}
            {canWrite && detected.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={confirmDetected}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Enregistrer les villes détectées ({detected.length})
              </Button>
            ) : null}
          </div>

          {/* Send bar */}
          {canWrite && rows.length > 0 ? (
            <div className="bg-accent/50 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox
                checked={
                  selectableIds.length > 0 &&
                  selectedResolved.length >= selectableIds.length
                }
                onCheckedChange={toggleAll}
                aria-label="Tout sélectionner"
              />
              <span className="font-medium">
                {selectedResolved.length} sélectionnée(s)
              </span>
              <div className="ml-1 flex items-center gap-1">
                <span className="text-muted-foreground text-xs">Mode :</span>
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
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blPending || selectedResolved.length === 0}
                  onClick={blOnly}
                >
                  Colis déjà créés → BL seul
                </Button>
                <Button
                  size="sm"
                  disabled={sending || selectedResolved.length === 0}
                  onClick={send}
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Envoyer à OzonExpress ({selectedResolved.length})
                </Button>
              </div>
            </div>
          ) : null}

          {/* Results */}
          {results ? (
            <div className="flex flex-col gap-2 rounded-xl border p-3">
              <h3 className="text-sm font-semibold">Résultats de l&apos;envoi</h3>
              {results.map((res) => (
                <div
                  key={res.orderId}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    res.ok
                      ? "bg-green-soft border-green/30"
                      : res.usedBefore
                        ? "bg-amber-soft border-amber/30"
                        : "bg-destructive/10 border-destructive/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{res.code}</span>
                    {res.ok ? (
                      <span className="text-green font-mono text-xs">
                        {res.tracking}
                        {res.cityName ? ` · ${res.cityName}` : ""}
                        {res.price ? ` · ${res.price} DH` : ""}
                      </span>
                    ) : res.usedBefore ? (
                      <span className="text-amber text-xs">
                        Déjà existant → inclus dans le BL
                      </span>
                    ) : (
                      <span className="text-destructive max-w-[60%] text-right text-xs break-words">
                        {res.error}
                      </span>
                    )}
                  </div>
                  {!res.ok && !res.usedBefore ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        className="h-8 flex-1 font-mono text-xs"
                        placeholder="tracking (optionnel)"
                        value={retryEdits[res.orderId] ?? ""}
                        onChange={(e) =>
                          setRetryEdits((p) => ({
                            ...p,
                            [res.orderId]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retrying === res.orderId}
                        onClick={() => retry(res)}
                      >
                        {retrying === res.orderId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                        Renvoyer
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}

              {candidateCodes.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button onClick={createBL} disabled={blPending}>
                    {blPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                    Créer le Bon de Livraison ({candidateCodes.length} colis)
                  </Button>
                  {bl ? <BLLinks bl={bl} /> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Order list */}
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
                const tone = resolved ? "green" : METHOD_TONE[row.method] ?? "neutral";
                const label = resolved
                  ? "Résolue"
                  : METHOD_LABEL[row.method] ?? row.method;
                const canSelect = Boolean(resolved);
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {canWrite ? (
                        <Checkbox
                          className="mt-1"
                          checked={selected.has(row.id)}
                          disabled={!canSelect}
                          onCheckedChange={() => toggleRow(row.id)}
                          aria-label="Sélectionner"
                        />
                      ) : null}
                      <div className="min-w-0">
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
                    </div>
                    {canWrite ? (
                      <div className="flex items-center gap-2">
                        {!resolved && row.suggestedId != null ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => confirmRow(row)}
                            title={`Confirmer : ${row.suggestedName}`}
                          >
                            <Check className="size-4" />
                          </Button>
                        ) : null}
                        <CityPicker
                          cities={cities}
                          valueName={resolved?.name ?? row.suggestedName}
                          disabled={busy}
                          onPick={(c) => pick(row, c)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bl">
          {notes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucun bon de livraison"
              message="Les BL créés apparaîtront ici avec leurs PDF."
            />
          ) : (
            <div className="rounded-xl border divide-y">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div>
                    <span className="font-mono font-medium">{n.ref}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {formatDate(n.createdAt)} · {n.parcelCount} colis
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {n.pdfUrl ? (
                      <a
                        href={n.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1 font-medium"
                      >
                        <FileText className="size-4" /> PDF BL
                      </a>
                    ) : null}
                    {n.labelsUrl ? (
                      <a
                        href={n.labelsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1 font-medium"
                      >
                        <ExternalLink className="size-4" /> Étiquettes
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
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
