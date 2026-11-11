"use client";

import * as React from "react";
import { Loader2, PackageCheck } from "lucide-react";
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
  backfillOverviewAction,
  startBackfillAction,
  stopBackfillAction,
  type BackfillOverview,
} from "./backfill-actions";

const nf = new Intl.NumberFormat("fr-FR");

/**
 * Owner-only maintenance: mark the old unfulfilled Shopify orders as fulfilled
 * so they stop reserving stock. Test on 50 first, then run everything.
 */
export function BackfillCard({ initial }: { initial: BackfillOverview }) {
  const [data, setData] = React.useState<BackfillOverview | null>(initial);
  const [pending, setPending] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const r = await backfillOverviewAction();
    if (r.ok) setData(r.data);
  }, []);

  // Refresh while a run is going.
  React.useEffect(() => {
    if (!data?.running) return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [data?.running, load]);

  async function start(mode: "test" | "all") {
    if (
      mode === "all" &&
      !window.confirm(
        "Marquer TOUTES les anciennes commandes comme traitées ? Difficile à annuler. Faites d'abord le test de 50."
      )
    ) {
      return;
    }
    setPending(mode);
    try {
      const r = await startBackfillAction(mode);
      if (r.ok) toast.success(mode === "test" ? "Test lancé (50 commandes)" : "Nettoyage lancé");
      else toast.error(r.message);
      await load();
    } finally {
      setPending(null);
    }
  }

  async function stop() {
    setPending("stop");
    try {
      const r = await stopBackfillAction();
      if (r.ok) toast.success("Arrêt demandé");
      else toast.error(r.message);
      await load();
    } finally {
      setPending(null);
    }
  }

  const stateLabel =
    data?.state === "running"
      ? "En cours"
      : data?.state === "done"
        ? "Terminé"
        : data?.state === "stopped"
          ? "Arrêté"
          : "Jamais lancé";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="bg-muted flex size-10 items-center justify-center rounded-lg">
            <PackageCheck className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">Anciennes commandes non traitées</CardTitle>
            <CardDescription>
              Les anciennes commandes Shopify restées « non traitées » réservent encore leur
              stock. Les marquer comme traitées libère ces réservations ; le stock vendable ne
              change pas. Aucun e-mail client.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={`À traiter (avant le ${data?.cutoff ?? "…"})`} value={data?.pending == null ? "…" : nf.format(data.pending)} />
          <Stat label="Dernier lancement" value={stateLabel} />
          <Stat label="Traitées" value={nf.format(data?.fulfilled ?? 0)} />
          <Stat label="Ignorées / erreurs" value={`${nf.format(data?.skipped ?? 0)} / ${nf.format(data?.errors ?? 0)}`} />
        </div>
        {data?.last ? (
          <p className="text-muted-foreground text-xs">Dernière commande vue : {data.last}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null || data?.running}
            onClick={() => start("test")}
          >
            {pending === "test" ? <Loader2 className="size-4 animate-spin" /> : null}
            Tester sur 50
          </Button>
          <Button size="sm" disabled={pending !== null || data?.running} onClick={() => start("all")}>
            {pending === "all" ? <Loader2 className="size-4 animate-spin" /> : null}
            Tout traiter
          </Button>
          {data?.running ? (
            <Button variant="ghost" size="sm" disabled={pending !== null} onClick={stop}>
              Arrêter
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
