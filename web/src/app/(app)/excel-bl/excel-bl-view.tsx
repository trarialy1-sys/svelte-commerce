"use client";

import * as React from "react";
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { arabicToLatin } from "@/lib/shipping/arabic";
import { formatMoney } from "@/lib/format";
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
  createExcelBLAction,
  parseExcelBLAction,
  type ExcelBLResult,
  type ExcelBLRow,
} from "./actions";

interface City {
  id: number;
  name: string;
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

function norm(s: string): string {
  return arabicToLatin(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function ExcelBLView() {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = React.useState(false);
  const [rows, setRows] = React.useState<ExcelBLRow[] | null>(null);
  const [cities, setCities] = React.useState<City[]>([]);
  const [confirm, setConfirm] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<ExcelBLResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    setOutcome(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await parseExcelBLAction(fd);
      if (r.ok) {
        setRows(r.data.rows);
        setCities(r.data.cities);
        toast.success(`${r.data.rows.length} ligne(s) lue(s)`);
      } else toast.error(r.message);
    } finally {
      setParsing(false);
    }
  }

  function setCity(id: string, city: City) {
    setRows((prev) =>
      (prev ?? []).map((row) =>
        row.id === id
          ? { ...row, cityId: city.id, cityName: city.name, cityOk: true, method: "saved" }
          : row
      )
    );
  }

  const resolved = (rows ?? []).filter((r) => r.cityId != null);
  const toFix = (rows ?? []).filter((r) => r.cityId == null);
  const incomplete = resolved.filter((r) => r.missing.length > 0).length;

  async function run() {
    if (!rows) return;
    setSending(true);
    try {
      const r = await createExcelBLAction(
        rows.map((row) => ({
          id: row.id,
          tracking: row.tracking,
          customer: row.customer,
          phone: row.phone,
          address: row.address,
          cityRaw: row.cityRaw,
          cityId: row.cityId,
          price: row.price,
          note: row.note,
          skus: row.skus,
        }))
      );
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setOutcome(r.data);
      if (r.data.bl) {
        toast.success(
          `${r.data.sent} colis créés · BL ${r.data.bl.ref}` +
            (r.data.blocked > 0 ? ` · ${r.data.blocked} bloqué(s)` : "")
        );
      } else if (r.data.blError) {
        toast.error(`Colis créés mais BL en échec : ${r.data.blError}`);
      } else {
        toast.warning("Aucun colis créé.");
      }
      setConfirm(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Excel → BL"
        subtitle="Importez un Excel de commandes, vérifiez les villes, puis créez les colis OzonExpress et le Bon de Livraison."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={parsing}
            onClick={() => fileRef.current?.click()}
          >
            {parsing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Importer Excel
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onFile}
      />

      {rows == null ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center text-sm">
          <FileSpreadsheet className="size-8 opacity-60" />
          <p>
            Format attendu : CODE SUIVI · DESTINATAIRE · TELEPHONE · ADRESSE · PRIX ·
            VILLE · COMMENTAIRE
          </p>
          <Button disabled={parsing} onClick={() => fileRef.current?.click()}>
            {parsing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Choisir un fichier
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Stats + action */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground rounded-md border px-2 py-0.5">
              Total <b className="text-foreground">{rows.length}</b>
            </span>
            <span className="text-muted-foreground border-green/40 rounded-md border px-2 py-0.5">
              Villes OK <b className="text-foreground">{resolved.length}</b>
            </span>
            {toFix.length > 0 ? (
              <span className="text-muted-foreground border-destructive/40 rounded-md border px-2 py-0.5">
                À corriger <b className="text-foreground">{toFix.length}</b>
              </span>
            ) : null}
            {incomplete > 0 ? (
              <span className="text-destructive flex items-center gap-1 text-xs font-medium">
                <TriangleAlert className="size-3.5" />
                {incomplete} ligne(s) à champs manquants
              </span>
            ) : null}
            <Button
              className="ml-auto"
              size="sm"
              disabled={sending || resolved.length === 0}
              onClick={() => setConfirm(true)}
            >
              <FileText className="size-4" />
              Créer les colis + BL ({resolved.length})
            </Button>
          </div>

          {/* Outcome */}
          {outcome ? <Outcome outcome={outcome} /> : null}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Code suivi</th>
                  <th className="px-3 py-2 text-left font-medium">Destinataire</th>
                  <th className="px-3 py-2 text-left font-medium">Adresse</th>
                  <th className="px-3 py-2 text-left font-medium">Ville</th>
                  <th className="px-3 py-2 text-left font-medium">Produits</th>
                  <th className="px-3 py-2 text-right font-medium">Prix</th>
                  <th className="px-3 py-2 text-left font-medium">Ville Ozon</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className={row.cityId == null ? "bg-destructive/5" : ""}>
                    <td className="px-3 py-2 font-mono text-xs">{row.tracking}</td>
                    <td className="px-3 py-2">
                      <div>{row.customer || "—"}</div>
                      {row.missing.length > 0 ? (
                        <div className="text-destructive text-xs">
                          manque : {row.missing.join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-muted-foreground max-w-[220px] px-3 py-2 text-xs">
                      {row.address || "—"}
                    </td>
                    <td className="px-3 py-2">{row.cityRaw || "—"}</td>
                    <td className="px-3 py-2">
                      {row.skus.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.skus.map((sku, i) => (
                            <span
                              key={`${sku}-${i}`}
                              className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs"
                            >
                              {sku}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(row.price)}
                    </td>
                    <td className="px-3 py-2">
                      {row.cityId != null ? (
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            status={row.method}
                            tone={row.method === "saved" ? "green" : "green"}
                            label={row.cityName}
                          />
                          <CityPicker cities={cities} onPick={(c) => setCity(row.id, c)} compact />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-destructive text-xs font-medium">
                            {METHOD_LABEL[row.method] ?? "À corriger"}
                            {row.cityName ? ` (${row.cityName} ?)` : ""}
                          </span>
                          <CityPicker cities={cities} onPick={(c) => setCity(row.id, c)} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        count={resolved.length}
        blocked={toFix.length}
        sending={sending}
        onOpenChange={(o) => {
          if (!o && !sending) setConfirm(false);
        }}
        onConfirm={run}
      />
    </>
  );
}

function Outcome({ outcome }: { outcome: ExcelBLResult }) {
  const failures = outcome.results.filter((r) => !r.ok && !r.blocked);
  return (
    <div className="bg-muted/30 flex flex-col gap-2 rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">
          {outcome.sent} colis créés
          {outcome.blocked > 0 ? ` · ${outcome.blocked} bloqué(s)` : ""}
          {failures.length > 0 ? ` · ${failures.length} échec(s)` : ""}
        </span>
        {outcome.bl ? (
          <span className="inline-flex items-center gap-3">
            <span className="font-mono font-medium">{outcome.bl.ref}</span>
            <a
              href={outcome.bl.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 font-medium"
            >
              <FileText className="size-4" /> PDF BL
            </a>
            <a
              href={outcome.bl.labelsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 font-medium"
            >
              <ExternalLink className="size-4" /> Étiquettes
            </a>
          </span>
        ) : null}
      </div>
      {outcome.blError ? (
        <p className="text-destructive text-xs">BL : {outcome.blError}</p>
      ) : null}
      {failures.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {failures.map((f) => (
            <li key={f.id} className="text-destructive text-xs">
              <span className="font-mono">{f.tracking}</span> — {f.error}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CityPicker({
  cities,
  onPick,
  compact,
}: {
  cities: City[];
  onPick: (c: City) => void;
  compact?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const results = React.useMemo(() => {
    const key = norm(q);
    if (!key) return [];
    const out: City[] = [];
    for (const c of cities) {
      if (norm(c.name).includes(key) || String(c.id) === q.trim()) {
        out.push(c);
        if (out.length >= 12) break;
      }
    }
    return out;
  }, [q, cities]);

  return (
    <div className="relative w-44">
      <Search className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
      <input
        className="border-input bg-background focus-visible:ring-ring/50 h-8 w-full rounded-md border pr-2 pl-7 text-xs outline-none focus-visible:ring-[3px]"
        placeholder={compact ? "Changer…" : "Choisir la ville…"}
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && results.length > 0 ? (
        <div className="bg-popover absolute z-20 mt-1 max-h-56 w-56 overflow-auto rounded-md border shadow-md">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(c);
                setOpen(false);
                setQ("");
              }}
            >
              <span>{c.name}</span>
              <span className="text-muted-foreground">{c.id}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  open,
  count,
  blocked,
  sending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  blocked: number;
  sending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer les colis + BL ?</DialogTitle>
          <DialogDescription>
            Crée {count} colis RÉELS chez OzonExpress (coût réel) et génère un seul
            Bon de Livraison.
            {blocked > 0
              ? ` ${blocked} ligne(s) sans ville valide seront ignorées.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={sending} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={sending || count === 0} onClick={onConfirm}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Créer {count} colis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
