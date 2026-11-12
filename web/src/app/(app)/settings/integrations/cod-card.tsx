"use client";

import * as React from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CodOverview } from "@/lib/cod/install";
import { setCodScriptAction } from "./cod-actions";

/** Owner-only: our own cash-on-delivery order form on the storefront. */
export function CodCard({ initial }: { initial: CodOverview }) {
  const [data, setData] = React.useState(initial);
  const [pending, setPending] = React.useState(false);

  async function set(on: boolean) {
    setPending(true);
    try {
      const r = await setCodScriptAction(on);
      if (r.ok) {
        setData(r.data);
        toast.success(on ? "Formulaire installé sur la boutique" : "Formulaire retiré de la boutique");
      } else toast.error(r.message);
    } finally {
      setPending(false);
    }
  }

  const products =
    data.products.length === 0
      ? "Aucun (désactivé)"
      : data.products.includes("*")
        ? "Tous les produits"
        : data.products.join(", ");
  const status =
    data.installed === null ? "Permission manquante" : data.installed ? "Installé" : "Non installé";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="bg-muted flex size-10 items-center justify-center rounded-lg">
            <ShoppingBag className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">Formulaire de commande (paiement à la livraison)</CardTitle>
            <CardDescription>
              Notre propre formulaire sur les pages produit. Il ne s&apos;affiche que sur les
              produits listés ; les commandes arrivent dans Shopify avec le tag odes_cod_form.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Script boutique" value={status} />
          <Stat label="Produits activés" value={products} />
          <Stat label="Commandes (7 j)" value={String(data.orders7d)} />
          <Stat label="Formulaires abandonnés (7 j)" value={String(data.abandoned7d)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {data.installed ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => set(false)}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Retirer de la boutique
            </Button>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => set(true)}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Installer sur la boutique
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}
