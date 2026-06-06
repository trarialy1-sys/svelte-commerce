"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { syncCatalogAction } from "./actions";

export function SyncButton({ lastSyncAt }: { lastSyncAt: string | null }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    try {
      const r = await syncCatalogAction();
      if (r.ok) {
        toast.success(
          `Synchronisé : ${r.products} produits, ${r.variants} variantes`
        );
        router.refresh();
      } else {
        toast.error(r.message ?? "Échec de la synchronisation");
      }
    } catch {
      toast.error("Échec de la synchronisation");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {lastSyncAt ? (
        <span className="text-muted-foreground hidden text-xs sm:inline">
          Dernière synchro :{" "}
          {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(lastSyncAt))}
        </span>
      ) : null}
      <Button onClick={run} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        Synchroniser depuis Shopify
      </Button>
    </div>
  );
}
