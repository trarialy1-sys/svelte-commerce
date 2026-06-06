"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plug, ShoppingBag, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";

import type { SafeIntegration } from "@/lib/integrations/types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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
import {
  connectOzonAction,
  connectShopifyAction,
  disconnectIntegrationAction,
  testIntegrationAction,
} from "./actions";

type ProviderKey = "SHOPIFY" | "OZON";

function statusTone(status: string): "green" | "amber" | "neutral" {
  if (status === "connected") return "green";
  if (status === "unverified") return "amber";
  return "neutral";
}
function statusLabel(status: string): string {
  if (status === "connected") return "Connecté";
  if (status === "unverified") return "Non vérifié";
  return "Non connecté";
}

interface IntegrationsClientProps {
  integrations: SafeIntegration[];
  isOwner: boolean;
}

export function IntegrationsClient({
  integrations,
  isOwner,
}: IntegrationsClientProps) {
  const router = useRouter();
  const [openProvider, setOpenProvider] = React.useState<ProviderKey | null>(
    null
  );
  const [pending, setPending] = React.useState<string | null>(null);

  // Connect form fields
  const [shopDomain, setShopDomain] = React.useState("");
  const [adminAccessToken, setAdminAccessToken] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");

  const byProvider = (p: string) =>
    integrations.find((i) => i.provider === p) ?? null;

  function openDialog(provider: ProviderKey) {
    const existing = byProvider(provider);
    // Never pre-fill secrets; pre-fill safe hints only.
    setAdminAccessToken("");
    setApiKey("");
    if (provider === "SHOPIFY") {
      setShopDomain(String(existing?.meta?.shopDomain ?? ""));
    } else {
      setCustomerId(String(existing?.meta?.customerId ?? ""));
    }
    setOpenProvider(provider);
  }

  async function submit() {
    if (!openProvider) return;
    setPending("save");
    try {
      const result =
        openProvider === "SHOPIFY"
          ? await connectShopifyAction({ shopDomain, adminAccessToken })
          : await connectOzonAction({ customerId, apiKey });
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
      setOpenProvider(null);
      router.refresh();
    } catch {
      toast.error("Échec de l'enregistrement");
    } finally {
      setPending(null);
    }
  }

  async function test(provider: ProviderKey) {
    setPending(`test:${provider}`);
    try {
      const r = await testIntegrationAction(provider);
      if (r.ok) toast.success(r.message);
      else toast.warning(r.message);
      router.refresh();
    } catch {
      toast.error("Échec du test");
    } finally {
      setPending(null);
    }
  }

  async function disconnect(provider: ProviderKey) {
    setPending(`disc:${provider}`);
    try {
      await disconnectIntegrationAction(provider);
      toast.success("Déconnecté");
      router.refresh();
    } catch {
      toast.error("Échec de la déconnexion");
    } finally {
      setPending(null);
    }
  }

  const cards: {
    key: ProviderKey;
    name: string;
    desc: string;
    icon: typeof ShoppingBag;
    hint: (i: SafeIntegration | null) => string;
  }[] = [
    {
      key: "SHOPIFY",
      name: "Shopify",
      desc: "Synchronisez produits, variantes et stock.",
      icon: ShoppingBag,
      hint: (i) =>
        i?.meta?.shopName
          ? `${i.meta.shopName} · ${i.meta.shopDomain}`
          : String(i?.meta?.shopDomain ?? ""),
    },
    {
      key: "OZON",
      name: "OzonExpress",
      desc: "Expéditions COD, bons de livraison et suivi.",
      icon: Truck,
      hint: (i) => (i?.meta?.customerId ? `ID client : ${i.meta.customerId}` : ""),
    },
  ];

  return (
    <>
      <PageHeader
        title="Intégrations"
        subtitle="Connectez les comptes de votre organisation. Les clés sont chiffrées et ne quittent jamais le serveur."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          const integ = byProvider(c.key);
          const status = integ?.status ?? "disconnected";
          const Icon = c.icon;
          const hint = c.hint(integ);
          return (
            <Card key={c.key}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <CardDescription>{c.desc}</CardDescription>
                    </div>
                  </div>
                  <StatusBadge
                    status={status}
                    tone={statusTone(status)}
                    label={statusLabel(status)}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground font-mono text-xs">
                  {hint || "—"}
                </p>
                {isOwner ? (
                  <div className="flex items-center gap-2">
                    {integ?.status && integ.status !== "disconnected" ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending !== null}
                          onClick={() => test(c.key)}
                        >
                          {pending === `test:${c.key}` ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Tester
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending !== null}
                          onClick={() => disconnect(c.key)}
                        >
                          Déconnecter
                        </Button>
                        <Button size="sm" onClick={() => openDialog(c.key)}>
                          Modifier
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => openDialog(c.key)}>
                        <Plug className="size-4" />
                        Connecter
                      </Button>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}

        {/* Platform-managed (read-only) */}
        <Card className="opacity-90">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-base">Anthropic (scan photo)</CardTitle>
                  <CardDescription>
                    Reconnaissance d&apos;étiquettes pour le stock.
                  </CardDescription>
                </div>
              </div>
              <StatusBadge status="platform" tone="violet" label="Géré par la plateforme" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Utilise la clé de la plateforme — aucune configuration requise.
            </p>
          </CardContent>
        </Card>
      </div>

      {!isOwner ? (
        <p className="text-muted-foreground text-sm">
          Seul le propriétaire de l&apos;organisation peut modifier les
          intégrations.
        </p>
      ) : null}

      {/* Connect / Edit dialog */}
      <Dialog
        open={openProvider !== null}
        onOpenChange={(o) => !o && setOpenProvider(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openProvider === "SHOPIFY" ? "Connecter Shopify" : "Connecter OzonExpress"}
            </DialogTitle>
            <DialogDescription>
              Vos clés sont chiffrées (AES-256-GCM) et stockées uniquement côté
              serveur.
            </DialogDescription>
          </DialogHeader>

          {openProvider === "SHOPIFY" ? (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="shopDomain">Domaine de la boutique</Label>
                <Input
                  id="shopDomain"
                  placeholder="exemple.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adminToken">Admin API access token</Label>
                <Input
                  id="adminToken"
                  type="password"
                  placeholder={
                    byProvider("SHOPIFY")?.status &&
                    byProvider("SHOPIFY")?.status !== "disconnected"
                      ? "•••• enregistré — saisir pour remplacer"
                      : "shpat_…"
                  }
                  value={adminAccessToken}
                  onChange={(e) => setAdminAccessToken(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="customerId">ID client</Label>
                <Input
                  id="customerId"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">Clé API</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={
                    byProvider("OZON")?.status &&
                    byProvider("OZON")?.status !== "disconnected"
                      ? "•••• enregistré — saisir pour remplacer"
                      : ""
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpenProvider(null)}
              disabled={pending === "save"}
            >
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending === "save"}>
              {pending === "save" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
