"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageX, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { ModulePage } from "@/components/module/module-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { stockConfig } from "@/modules/stock/config";
import { ScanDialog } from "./scan-dialog";
import { deleteVariantsAction, setStockAction } from "./actions";
import { CsvImportButton } from "../products/csv-import-button";

function StockBulkBar({
  ids,
  clear,
  canDelete,
}: {
  ids: string[];
  clear: () => void;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [restockOpen, setRestockOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [qty, setQty] = React.useState("10");

  async function remove() {
    setPending("delete");
    try {
      const r = await deleteVariantsAction(ids);
      if (r.ok) {
        toast.success(`${r.deleted} article(s) supprimé(s)`);
        setDeleteOpen(false);
        clear();
        router.refresh();
      } else toast.error(r.message ?? "Échec");
    } finally {
      setPending(null);
    }
  }

  async function rupture() {
    setPending("rupture");
    try {
      const r = await setStockAction(ids, "rupture");
      if (r.ok) {
        toast.success(`${r.updated} article(s) en rupture`);
        clear();
        router.refresh();
      } else toast.error(r.message ?? "Échec");
    } finally {
      setPending(null);
    }
  }

  async function restock() {
    const n = parseInt(qty, 10);
    if (Number.isNaN(n) || n < 0) {
      toast.warning("Quantité invalide");
      return;
    }
    setPending("restock");
    try {
      const r = await setStockAction(ids, "restock", n);
      if (r.ok) {
        toast.success(`${r.updated} réapprovisionné(s)`);
        setRestockOpen(false);
        clear();
        router.refresh();
      } else toast.error(r.message ?? "Échec");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending !== null}
        onClick={rupture}
      >
        {pending === "rupture" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <PackageX className="size-4" />
        )}
        Marquer rupture
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending !== null}
        onClick={() => setRestockOpen(true)}
      >
        <RotateCcw className="size-4" />
        Réapprovisionner
      </Button>
      {canDelete ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={pending !== null}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
          Supprimer
        </Button>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer du catalogue</DialogTitle>
            <DialogDescription>
              Supprimer définitivement {ids.length} article(s) ? Les variantes
              synchronisées depuis Shopify réapparaîtront à la prochaine synchro.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={remove}
              disabled={pending === "delete"}
            >
              {pending === "delete" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réapprovisionner</DialogTitle>
            <DialogDescription>
              Quantité à définir pour {ids.length} article(s).
            </DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestockOpen(false)}>
              Annuler
            </Button>
            <Button onClick={restock} disabled={pending === "restock"}>
              {pending === "restock" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StockView({ role }: { role: AppRole | null }) {
  const canWrite = meetsOrgRole(role, "operator");
  const canImport = meetsOrgRole(role, "admin");
  const canDelete = meetsOrgRole(role, "operator");
  return (
    <ModulePage
      config={stockConfig}
      role={role}
      actions={
        canWrite || canImport ? (
          <div className="flex items-center gap-2">
            {canImport ? <CsvImportButton /> : null}
            {canWrite ? <ScanDialog /> : null}
          </div>
        ) : null
      }
      renderBulkExtra={
        canWrite
          ? (ids, clear) => (
              <StockBulkBar ids={ids} clear={clear} canDelete={canDelete} />
            )
          : undefined
      }
    />
  );
}
