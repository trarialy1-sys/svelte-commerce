"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  ENTITY_FIELDS,
  type CommitResult,
  type DryRunResult,
  type ImportEntity,
  type MappedRow,
  type RowError,
} from "@/lib/import/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dryRunImportAction, commitImportAction } from "./actions";

const NONE = "__none__";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Light header synonyms for auto-mapping.
const SYNONYMS: Record<string, string[]> = {
  name: ["nom", "name", "client", "destinataire", "fullname"],
  customerName: ["nom", "client", "destinataire", "name"],
  phone: ["telephone", "tel", "phone", "gsm", "mobile", "numero"],
  city: ["ville", "city"],
  address: ["adresse", "address"],
  tags: ["tags", "tag", "etiquettes"],
  sku: ["sku", "ref", "reference", "article", "produit", "codesuivi"],
  title: ["titre", "title", "produit", "nom", "designation"],
  price: ["prix", "price", "montant"],
  totalPrice: ["prix", "total", "montant", "price"],
  inventoryQty: ["stock", "quantite", "qty", "inventaire", "qte"],
  cost: ["cout", "cost", "achat"],
  category: ["categorie", "category", "type"],
  code: ["code", "reference", "ref", "commande", "order", "codesuivi"],
  note: ["note", "commentaire", "remarque", "comment"],
};

function guessMapping(
  headers: string[],
  fields: { key: string }[]
): Record<string, string> {
  const nh = headers.map((h) => ({ h, n: norm(h) }));
  const map: Record<string, string> = {};
  for (const f of fields) {
    const syns = SYNONYMS[f.key] ?? [norm(f.key)];
    const hit = nh.find(({ n }) => syns.some((sy) => n === sy || n.includes(sy)));
    map[f.key] = hit ? hit.h : NONE;
  }
  return map;
}

function downloadErrors(errors: RowError[]) {
  const head = "Ligne,Erreurs\r\n";
  const body = errors
    .map((e) => `${e.row},"${e.messages.join("; ").replace(/"/g, '""')}"`)
    .join("\r\n");
  const blob = new Blob([`﻿${head}${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `import-erreurs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Step = "upload" | "map" | "preview" | "done";

export function ImportWizard() {
  const [entity, setEntity] = React.useState<ImportEntity>("customers");
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [dry, setDry] = React.useState<DryRunResult | null>(null);
  const [result, setResult] = React.useState<CommitResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  const fields = ENTITY_FIELDS[entity].fields;

  function reset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setDry(null);
    setResult(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (json.length === 0) {
        toast.error("Fichier vide ou illisible.");
        return;
      }
      const hdrs = Object.keys(json[0]);
      const parsed = json.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))
      );
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(parsed);
      setMapping(guessMapping(hdrs, fields));
      setStep("map");
    } catch {
      toast.error("Impossible de lire le fichier.");
    }
  }

  function buildMapped(): MappedRow[] {
    return rows.map((r) => {
      const m: MappedRow = {};
      for (const f of fields) {
        const h = mapping[f.key];
        if (h && h !== NONE) m[f.key] = r[h] ?? "";
      }
      return m;
    });
  }

  const requiredMapped = fields
    .filter((f) => f.required)
    .every((f) => mapping[f.key] && mapping[f.key] !== NONE);

  async function onDryRun() {
    setBusy(true);
    try {
      const res = await dryRunImportAction(entity, buildMapped());
      if (res.ok) {
        setDry(res.data);
        setStep("preview");
      } else toast.error(res.message);
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    setBusy(true);
    try {
      const res = await commitImportAction(entity, buildMapped());
      if (res.ok) {
        setResult(res.data);
        setStep("done");
        toast.success(`${res.data.created} créé(s), ${res.data.updated} mis à jour.`);
      } else toast.error(res.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step 1 — entity + file */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Fichier</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label>Type de données</Label>
            <Select
              value={entity}
              onValueChange={(v) => {
                setEntity(v as ImportEntity);
                reset();
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ENTITY_FIELDS) as ImportEntity[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ENTITY_FIELDS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="import-file">Fichier Excel / CSV</Label>
            <input
              id="import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFile}
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-accent file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          {fileName ? (
            <span className="text-muted-foreground text-sm">
              {fileName} · {rows.length} ligne(s)
            </span>
          ) : null}
        </CardContent>
      </Card>

      {/* Step 2 — mapping */}
      {step !== "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Correspondance des colonnes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fields.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <Label className="w-44 shrink-0">
                  {f.label}
                  {f.required ? <span className="text-destructive"> *</span> : null}
                  {f.hint ? (
                    <span className="text-muted-foreground ml-1 text-xs">({f.hint})</span>
                  ) : null}
                </Label>
                <Select
                  value={mapping[f.key] ?? NONE}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                >
                  <SelectTrigger className="w-64" size="sm">
                    <SelectValue placeholder="— Colonne —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Ignorer —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={onDryRun} disabled={!requiredMapped || busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Aperçu (vérification)
              </Button>
              {!requiredMapped ? (
                <span className="text-muted-foreground text-xs">
                  Mappez les champs requis (*).
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 3 — dry-run preview */}
      {step === "preview" && dry ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Aperçu</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <Stat label="Total" value={dry.total} />
              <Stat label="À créer" value={dry.toCreate} tone="text-green" />
              <Stat label="À mettre à jour" value={dry.toUpdate} tone="text-blue" />
              <Stat
                label="Erreurs"
                value={dry.errorCount}
                tone={dry.errorCount ? "text-destructive" : undefined}
              />
            </div>
            {dry.errors.length ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Lignes en erreur</span>
                  <Button variant="outline" size="sm" onClick={() => downloadErrors(dry.errors)}>
                    <Download className="size-4" /> Télécharger les erreurs
                  </Button>
                </div>
                <ul className="max-h-48 overflow-auto rounded border text-sm">
                  {dry.errors.slice(0, 50).map((e) => (
                    <li key={e.row} className="border-b px-3 py-1.5 last:border-0">
                      <span className="font-mono">L{e.row}</span> · {e.messages.join(" · ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Button onClick={onCommit} disabled={busy || dry.toCreate + dry.toUpdate === 0}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Importer {dry.toCreate + dry.toUpdate} ligne(s)
              </Button>
              <Button variant="outline" onClick={() => setStep("map")} disabled={busy}>
                Retour
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 4 — result */}
      {step === "done" && result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import terminé</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <Stat label="Créés" value={result.created} tone="text-green" />
              <Stat label="Mis à jour" value={result.updated} tone="text-blue" />
              <Stat
                label="Échecs"
                value={result.failed}
                tone={result.failed ? "text-destructive" : undefined}
              />
            </div>
            {result.errors.length ? (
              <Button variant="outline" size="sm" onClick={() => downloadErrors(result.errors)}>
                <Download className="size-4" /> Télécharger les échecs
              </Button>
            ) : null}
            <Button variant="outline" onClick={reset}>
              Nouvel import
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
