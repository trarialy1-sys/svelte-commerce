"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { refreshCityCatalogAction } from "./actions";

/** Admin-only trigger to (re)load the global OzonExpress city catalog. */
export function CityCatalogButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    try {
      const r = await refreshCityCatalogAction();
      if (r.ok) {
        toast.success(`${r.count} villes chargées`);
        router.refresh();
      } else {
        toast.error(r.message ?? "Échec du chargement");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      Charger / actualiser
    </Button>
  );
}
