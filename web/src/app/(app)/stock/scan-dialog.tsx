"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ScanMatch } from "@/lib/scan";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { scanImageAction, setStockAction } from "./actions";

function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const base64 = result.split(",")[1] ?? "";
      resolve({ data: base64, mediaType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ScanDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<"idle" | "scanning" | "review" | "saving">(
    "idle"
  );
  const [matches, setMatches] = React.useState<ScanMatch[]>([]);
  const [unmatched, setUnmatched] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  function reset() {
    setPhase("idle");
    setMatches([]);
    setUnmatched([]);
    setSelected(new Set());
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase("scanning");
    try {
      const { data, mediaType } = await fileToBase64(file);
      const r = await scanImageAction(data, mediaType);
      if (!r.ok || !r.result) {
        toast.error(r.message ?? "Échec du scan");
        setPhase("idle");
        return;
      }
      setMatches(r.result.matched);
      setUnmatched(r.result.unmatched);
      // Pre-select the ones the AI flagged as marked (out of stock).
      setSelected(
        new Set(r.result.matched.filter((m) => m.marked).map((m) => m.variantId))
      );
      setPhase("review");
    } catch {
      toast.error("Échec de la lecture de l'image");
      setPhase("idle");
    } finally {
      e.target.value = "";
    }
  }

  function toggle(variantId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  async function confirm() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.warning("Aucun article sélectionné");
      return;
    }
    setPhase("saving");
    try {
      const r = await setStockAction(ids, "rupture");
      if (r.ok) {
        toast.success(`${r.updated} article(s) mis en rupture`);
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.message ?? "Échec");
        setPhase("review");
      }
    } catch {
      toast.error("Échec de la mise à jour");
      setPhase("review");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Camera className="size-4" />
        Scanner une photo
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scanner une photo</DialogTitle>
            <DialogDescription>
              Photographiez les étiquettes ; les articles barrés/entourés seront
              proposés en rupture.
            </DialogDescription>
          </DialogHeader>

          {phase === "idle" ? (
            <label className="border-border hover:bg-accent/40 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <Camera className="text-muted-foreground size-8" />
              <span className="text-sm font-medium">
                Choisir ou prendre une photo
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFile}
              />
            </label>
          ) : null}

          {phase === "scanning" ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Analyse de l&apos;image…
            </div>
          ) : null}

          {phase === "review" || phase === "saving" ? (
            <div className="flex flex-col gap-3">
              {matches.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucun SKU reconnu dans le catalogue.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {matches.map((m) => (
                    <li
                      key={m.variantId}
                      className="flex items-center gap-2 rounded-md border px-3 py-2"
                    >
                      <Checkbox
                        checked={selected.has(m.variantId)}
                        onCheckedChange={() => toggle(m.variantId)}
                      />
                      <span className="font-mono text-sm">{m.sku}</span>
                      {m.marked ? (
                        <span className="text-destructive ml-auto text-xs">
                          marqué
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {unmatched.length > 0 ? (
                <div className="text-muted-foreground text-xs">
                  Non reconnus : {unmatched.join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Annuler
            </Button>
            {phase === "review" || phase === "saving" ? (
              <Button onClick={confirm} disabled={phase === "saving"}>
                {phase === "saving" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Confirmer la rupture ({selected.size})
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
