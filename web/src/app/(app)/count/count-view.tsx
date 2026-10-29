"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, ClipboardCheck, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addArrivalAction, saveCountAction, saveCountNoteAction } from "./actions";

export interface CountVariant {
  id: string;
  sku: string;
  /** e.g. "Noir / XL" */
  label: string;
  qty: number;
  countedAt: string | null;
  countedBy: string | null;
  note: string | null;
}

export interface CountProduct {
  id: string;
  title: string;
  image: string | null;
  active: boolean;
  variants: CountVariant[];
}

/** A count older than this is « à faire » again. */
const RECOUNT_DAYS = 30;
const NAME_KEY = "odes-count-name";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function isDone(v: CountVariant): boolean {
  return v.countedAt != null && Date.now() - new Date(v.countedAt).getTime() < RECOUNT_DAYS * 86_400_000;
}

function VariantRow({
  v,
  name,
  canAct,
  arrival,
  onSaved,
}: {
  v: CountVariant;
  name: string;
  canAct: boolean;
  /** Arrivage mode: the typed quantity is ADDED to the stock. */
  arrival: boolean;
  onSaved: (v: CountVariant) => void;
}) {
  const [qty, setQty] = React.useState("");
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState(v.note ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Écris ton prénom en haut d'abord.");
    const n = Number(qty);
    if (arrival) {
      if (qty === "" || !Number.isFinite(n) || n <= 0) return toast.error("Tape le nombre de pièces arrivées.");
      setBusy(true);
      const a = await addArrivalAction(v.id, n, name);
      setBusy(false);
      if (!a.ok) return toast.error(a.message);
      toast.success(`${v.sku} +${n} → ${a.data.qty ?? "?"}`);
      setQty("");
      onSaved({ ...v, qty: a.data.qty ?? v.qty + n });
      return;
    }
    if (qty === "" || !Number.isFinite(n) || n < 0) return toast.error("Tape la quantité comptée (0 = rupture).");
    setBusy(true);
    const r = await saveCountAction(v.id, n, name, noteOpen ? note : null);
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(`${v.sku} → ${r.data.qty}${r.data.qty === 0 ? " (rupture)" : ""}`);
    setQty("");
    onSaved({ ...v, qty: r.data.qty, countedAt: new Date().toISOString(), countedBy: name, note: noteOpen ? note : v.note });
  }

  async function saveNote() {
    const r = await saveCountNoteAction(v.id, note);
    if (!r.ok) return toast.error(r.message);
    toast.success("Remarque enregistrée");
    onSaved({ ...v, note });
  }

  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{v.label || "—"}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {v.sku} · stock {v.qty}
            {v.countedAt ? ` · compté ${DATE_FMT.format(new Date(v.countedAt))}${v.countedBy ? ` par ${v.countedBy}` : ""}` : ""}
          </div>
          {v.note && !noteOpen ? <div className="text-xs text-amber-700 dark:text-amber-300">💬 {v.note}</div> : null}
        </div>
        {canAct ? (
          <>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={arrival ? "+ Qté" : "Qté"}
              className="w-20"
            />
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {arrival ? "Arrivé" : "OK"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen((o) => !o)} title="Remarque">
              <MessageSquare />
            </Button>
          </>
        ) : null}
      </div>
      {noteOpen ? (
        <div className="mt-2 flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Remarque (ex. : 2 abîmés, étiquette manquante)" />
          <Button size="sm" variant="outline" onClick={saveNote}>
            Enregistrer
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CountView({ products, role }: { products: CountProduct[]; role: AppRole | null }) {
  const canAct = meetsOrgRole(role, "operator");
  const [data, setData] = React.useState(products);
  const [name, setName] = React.useState("");
  const [q, setQ] = React.useState("");
  const [todo, setTodo] = React.useState(true);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [shown, setShown] = React.useState(60);
  const [arrival, setArrival] = React.useState(false);

  React.useEffect(() => {
    try {
      // Restore the counter's name after hydration (localStorage is client-only).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* private mode */
    }
  }, []);
  function saveName(n: string) {
    setName(n);
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* private mode */
    }
  }

  function onSaved(pid: string, nv: CountVariant) {
    setData((d) =>
      d.map((p) => (p.id !== pid ? p : { ...p, variants: p.variants.map((v) => (v.id === nv.id ? nv : v)) }))
    );
  }

  const nq = norm(q.trim());
  const list = data.filter((p) => {
    if (nq && !norm(p.title).includes(nq) && !p.variants.some((v) => norm(v.sku).includes(nq))) return false;
    if (todo && !arrival && !nq && p.variants.every(isDone)) return false;
    return true;
  });
  const total = data.reduce((n, p) => n + p.variants.length, 0);
  const done = data.reduce((n, p) => n + p.variants.filter(isDone).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Comptage"
        subtitle="Comptage : tape la quantité comptée puis OK (le stock Shopify devient ce chiffre, 0 = rupture). Arrivage : tape les pièces reçues, elles s'ajoutent au stock."
      />
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-2 bg-background/95 px-1 py-2 backdrop-blur sm:flex-row sm:items-center">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom ou SKU)" className="sm:flex-1" />
        <Input value={name} onChange={(e) => saveName(e.target.value)} placeholder="Ton prénom" className="sm:w-40" />
        <div className="flex rounded-lg border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setArrival(false)}
            className={`rounded-md px-3 py-1 ${!arrival ? "bg-primary text-primary-foreground" : ""}`}
          >
            Comptage
          </button>
          <button
            type="button"
            onClick={() => setArrival(true)}
            className={`rounded-md px-3 py-1 ${arrival ? "bg-primary text-primary-foreground" : ""}`}
          >
            Arrivage (+)
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} className="size-4" />
          À faire
        </label>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {done} / {total} vérifiés ({RECOUNT_DAYS} j)
        </span>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={todo ? "Tout est compté 👍" : "Aucun résultat"} />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {list.slice(0, shown).map((p) => {
            const isOpen = open[p.id] ?? (Boolean(nq) || p.variants.length === 1);
            const left = p.variants.filter((v) => !isDone(v)).length;
            return (
              <div key={p.id} className="px-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 py-2 text-left"
                  onClick={() => setOpen((o) => ({ ...o, [p.id]: !isOpen }))}
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="size-12 shrink-0 rounded-lg border object-cover" loading="lazy" />
                  ) : (
                    <div className="size-12 shrink-0 rounded-lg border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.variants.length} variante{p.variants.length > 1 ? "s" : ""}
                      {left ? ` · ${left} à compter` : " · ✔ compté"}
                      {!p.active ? " · hors ligne" : ""}
                    </div>
                  </div>
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                {isOpen ? (
                  <div className="divide-y border-t pb-2 sm:pl-15">
                    {p.variants.map((v) => (
                      <VariantRow key={v.id} v={v} name={name} canAct={canAct} arrival={arrival} onSaved={(nv) => onSaved(p.id, nv)} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {list.length > shown ? (
        <Button variant="outline" onClick={() => setShown((s) => s + 60)}>
          Afficher plus ({list.length - shown})
        </Button>
      ) : null}
    </div>
  );
}
