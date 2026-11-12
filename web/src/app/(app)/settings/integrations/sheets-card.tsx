"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SheetsOverview } from "@/lib/sheets/export";
import {
  beginGoogleOAuthAction,
  createSheetAction,
  disconnectGoogleAction,
  inspectSheetAction,
  linkSheetAction,
  retryFailedSheetsAction,
  setSheetsEnabledAction,
} from "./sheets-actions";

const OAUTH_ERRORS: Record<string, string> = {
  error_denied: "connexion refusée sur Google",
  error_state: "lien expiré, réessayez",
  error_session: "session différente, réessayez",
  error_refresh: "Google n'a pas donné d'accès permanent, réessayez",
  error_scope: "cochez l'accès à Google Sheets sur l'écran Google",
  error_exchange: "échange avec Google impossible",
};

/** Owner-only: write each form order into a Google Sheet, like the COD-form apps. */
export function SheetsCard({ initial, configured }: { initial: SheetsOverview; configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = React.useState(initial);
  const [pending, setPending] = React.useState<string | null>(null);
  const [link, setLink] = React.useState("");
  const [found, setFound] = React.useState<{ id: string; title: string; tabs: string[] } | null>(null);
  const [tab, setTab] = React.useState("");
  const [newTitle, setNewTitle] = React.useState("Commandes COD");
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    const s = searchParams.get("google");
    if (!s) return;
    if (s === "connected") toast.success("Compte Google connecté");
    else toast.error(`Connexion Google : ${OAUTH_ERRORS[s] ?? s}`);
    router.replace("/settings/integrations");
  }, [searchParams, router]);

  async function run<T>(key: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>, onOk?: (d: T) => void) {
    setPending(key);
    try {
      const r = await fn();
      if (r.ok) onOk?.(r.data);
      else toast.error(r.message);
    } finally {
      setPending(null);
    }
  }

  const connect = () =>
    run("connect", beginGoogleOAuthAction, (d) => {
      window.location.assign(d.url);
    });

  const inspect = () =>
    run("inspect", () => inspectSheetAction(link), (d) => {
      setFound(d);
      setTab(d.tabs[0] ?? "");
    });

  const save = () =>
    run("link", () => linkSheetAction(found!.id, tab), (d) => {
      setData(d);
      setFound(null);
      setLink("");
      setEditing(false);
      toast.success("Feuille enregistrée");
    });

  const create = () =>
    run("create", () => createSheetAction(newTitle), (d) => {
      setData(d);
      setEditing(false);
      toast.success("Nouvelle feuille créée dans votre Google Drive");
    });

  const spin = (k: string) => (pending === k ? <Loader2 className="size-4 animate-spin" /> : null);
  const m = data.meta;
  const connected = data.status !== "disconnected";
  const choosing = connected && (editing || !m.spreadsheetId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="bg-muted flex size-10 items-center justify-center rounded-lg">
            <FileSpreadsheet className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">Google Sheets : export des commandes</CardTitle>
            <CardDescription>
              Chaque commande du formulaire est ajoutée en bas de la feuille choisie : date, commande,
              produit, SKU, prix, destinataire, adresse, téléphone, ville.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {!configured ? (
          <p className="text-muted-foreground">
            Google n&apos;est pas encore configuré sur le serveur (GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET).
          </p>
        ) : !connected ? (
          <div>
            <Button size="sm" disabled={pending !== null} onClick={connect}>
              {spin("connect")}
              Connecter un compte Google
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Compte Google" value={m.email ?? "Connecté"} />
              <Stat label="Feuille" value={m.spreadsheetTitle ? `${m.spreadsheetTitle} › ${m.tab}` : "Aucune"} />
              <Stat label="Export" value={m.enabled ? "Activé" : "Désactivé"} />
              <Stat label="Lignes ajoutées (7 j)" value={String(data.exported7d)} />
            </div>

            {data.status === "unverified" ? (
              <p className="text-destructive">L&apos;accès Google a été retiré. Reconnectez le compte.</p>
            ) : null}
            {m.lastExport ? (
              <p className="text-muted-foreground">
                Dernière ligne : {m.lastExport.orderName}, {new Date(m.lastExport.at).toLocaleString("fr-FR")}
              </p>
            ) : null}
            {data.failed7d > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-destructive">
                  {data.failed7d} commande(s) pas encore dans la feuille
                  {m.lastError ? ` : ${m.lastError.message}` : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() =>
                    run("retry", retryFailedSheetsAction, (d) => {
                      setData(d);
                      toast.success(`${d.queued} commande(s) renvoyée(s)`);
                    })
                  }
                >
                  {spin("retry")}
                  Renvoyer
                </Button>
              </div>
            ) : null}

            {choosing ? (
              <div className="flex flex-col gap-3 rounded-md border p-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sheet-link">Feuille existante (lien Google Sheets)</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="sheet-link"
                      className="min-w-0 flex-1"
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                      value={link}
                      onChange={(e) => {
                        setLink(e.target.value);
                        setFound(null);
                      }}
                    />
                    <Button variant="outline" size="sm" disabled={!link || pending !== null} onClick={inspect}>
                      {spin("inspect")}
                      Ouvrir
                    </Button>
                  </div>
                  {found ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">{found.title} › onglet</span>
                      <Select value={tab} onValueChange={setTab}>
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {found.tabs.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" disabled={!tab || pending !== null} onClick={save}>
                        {spin("link")}
                        Utiliser cet onglet
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sheet-new">Ou créer une nouvelle feuille</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="sheet-new"
                      className="min-w-0 flex-1"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                    <Button variant="outline" size="sm" disabled={pending !== null} onClick={create}>
                      {spin("create")}
                      Créer
                    </Button>
                  </div>
                </div>
                {m.spreadsheetId ? (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      Annuler
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {m.spreadsheetId && !choosing ? (
                m.enabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => run("off", () => setSheetsEnabledAction(false), setData)}
                  >
                    {spin("off")}
                    Désactiver l&apos;export
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending !== null}
                    onClick={() =>
                      run("on", () => setSheetsEnabledAction(true), (d) => {
                        setData(d);
                        toast.success("Export activé");
                      })
                    }
                  >
                    {spin("on")}
                    Activer l&apos;export
                  </Button>
                )
              ) : null}
              {m.spreadsheetId && !choosing ? (
                <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => setEditing(true)}>
                  Changer de feuille
                </Button>
              ) : null}
              {m.spreadsheetUrl ? (
                <Button variant="ghost" size="sm" asChild>
                  <a href={m.spreadsheetUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" />
                    Ouvrir la feuille
                  </a>
                </Button>
              ) : null}
              {data.status === "unverified" ? (
                <Button size="sm" disabled={pending !== null} onClick={connect}>
                  {spin("connect")}
                  Reconnecter Google
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={pending !== null}
                onClick={() => {
                  if (window.confirm("Déconnecter le compte Google ? L'export s'arrête.")) {
                    void run("disconnect", disconnectGoogleAction, setData);
                  }
                }}
              >
                {spin("disconnect")}
                Déconnecter Google
              </Button>
            </div>
          </>
        )}
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
