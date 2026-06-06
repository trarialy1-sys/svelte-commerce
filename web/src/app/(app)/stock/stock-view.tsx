"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageX, RotateCcw } from "lucide-react";
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
import { setStockAction } from "./actions";

function StockBulkBar({ ids, clear }: { ids: string[]; clear: () => void }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [restockOpen, setRestockOpen] = React.useState(false);
  const [qty, setQty] = React.useState("10");

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
  return (
    <ModulePage
      config={stockConfig}
      role={role}
      actions={canWrite ? <ScanDialog /> : null}
      renderBulkExtra={
        canWrite
          ? (ids, clear) => <StockBulkBar ids={ids} clear={clear} />
          : undefined
      }
    />
  );
}
