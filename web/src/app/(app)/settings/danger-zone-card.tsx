"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetTestDataAction } from "./actions";

/**
 * Owner-only danger zone: wipe all orders + shipping (delivery notes, parcels)
 * for a clean test slate. Catalog, customers, integrations are kept. Guarded by
 * a type-to-confirm dialog.
 */
export function DangerZoneCard() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    try {
      const r = await resetTestDataAction(confirm);
      if (r.ok) {
        toast.success(r.message ?? "Données de test réinitialisées");
        setOpen(false);
        setConfirm("");
        router.refresh();
      } else {
        toast.error(r.message ?? "Échec");
      }
    } catch {
      toast.error("Échec de la réinitialisation");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-lg">
            <TriangleAlert className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">Zone de danger</CardTitle>
            <CardDescription>
              Réinitialiser les données de test (commandes + expéditions).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Supprime <strong>toutes les commandes</strong>, colis et bons de
          livraison. Catalogue, clients et intégrations sont conservés.
          Irréversible.
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          Tout supprimer
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setConfirm("");
          setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer toutes les commandes ?</DialogTitle>
            <DialogDescription>
              Cette action supprime définitivement toutes les commandes, colis et
              bons de livraison de cette organisation. Tapez{" "}
              <strong>SUPPRIMER</strong> pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmation</Label>
            <Input
              id="confirm"
              value={confirm}
              placeholder="SUPPRIMER"
              autoComplete="off"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={run}
              disabled={pending || confirm.trim().toUpperCase() !== "SUPPRIMER"}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
