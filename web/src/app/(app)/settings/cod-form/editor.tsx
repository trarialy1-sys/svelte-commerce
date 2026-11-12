"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  ClickUpsell,
  CodConfig,
  FieldConfig,
  OfferTier,
  PromoCodeConfig,
  QuantityOffer,
  ShippingRate,
  Texts,
  TickUpsell,
  TierType,
} from "@/lib/cod/config";

import { saveCodConfigAction } from "./actions";

// ── small building blocks ────────────────────────────────────────────────────
const dh = (cents: number | null) => (cents === null ? "" : String(cents / 100));
const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(",", ".")) * 100));
const list = (v: string[]) => v.join(", ");
const parseList = (v: string) => v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[220px_1fr] sm:items-start sm:gap-4">
      <div className="pt-2">
        <Label>{label}</Label>
        {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
      <input type="checkbox" className="size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Choice<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <select
      className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Money({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  const [text, setText] = React.useState(dh(value));
  return (
    <div className="flex items-center gap-1">
      <Input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(cents(e.target.value));
        }}
      />
      <span className="text-muted-foreground text-xs">dh</span>
    </div>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label="Supprimer">
      <Trash2 className="size-4" />
    </Button>
  );
}

// ── editor ───────────────────────────────────────────────────────────────────
export function CodFormEditor({ initial }: { initial: CodConfig }) {
  const [c, setC] = React.useState<CodConfig>(initial);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const set = <K extends keyof CodConfig>(k: K, v: CodConfig[K]) => {
    setC((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };
  const setText = (k: keyof Texts, v: string) => set("texts", { ...c.texts, [k]: v });
  const setFraud = (k: keyof CodConfig["fraud"], v: number | string[]) => set("fraud", { ...c.fraud, [k]: v });

  async function save() {
    setSaving(true);
    try {
      const r = await saveCodConfigAction(c);
      if (r.ok) {
        setC(r.config);
        setDirty(false);
        toast.success("Formulaire enregistré. La boutique l'utilise dans la minute.");
      } else toast.error(r.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b py-2 backdrop-blur">
        <p className="text-muted-foreground text-sm">
          {c.enabled ? "Formulaire activé" : "Formulaire désactivé"} ·{" "}
          {c.products.includes("*") ? "tous les produits" : `${c.products.length} produit(s)`}
          {dirty ? " · modifications non enregistrées" : ""}
        </p>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="fields">Champs</TabsTrigger>
          <TabsTrigger value="look">Textes & style</TabsTrigger>
          <TabsTrigger value="offers">Offres quantité</TabsTrigger>
          <TabsTrigger value="upsells">Upsells</TabsTrigger>
          <TabsTrigger value="shipping">Livraison</TabsTrigger>
          <TabsTrigger value="promo">Codes promo</TabsTrigger>
          <TabsTrigger value="fraud">Anti-fraude</TabsTrigger>
          <TabsTrigger value="pixels">Pixels</TabsTrigger>
        </TabsList>

        {/* ── Général ── */}
        <TabsContent value="general">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <Row label="Formulaire">
                <Toggle checked={c.enabled} onChange={(v) => set("enabled", v)} label="Activé sur la boutique" />
              </Row>
              <Row label="Produits" hint="Handles séparés par des virgules, ou * pour tous les produits.">
                <Textarea rows={2} defaultValue={list(c.products)} onChange={(e) => set("products", parseList(e.target.value).map((s) => s.toLowerCase()))} />
              </Row>
              <Row label="Produits exclus" hint="Utile avec *.">
                <Textarea rows={2} defaultValue={list(c.excludeProducts)} onChange={(e) => set("excludeProducts", parseList(e.target.value).map((s) => s.toLowerCase()))} />
              </Row>
              <Row label="Affichage">
                <Choice
                  value={c.mode}
                  onChange={(v) => set("mode", v)}
                  options={[
                    ["popup", "Fenêtre (pop-up) au clic sur le bouton"],
                    ["embedded", "Intégré dans la page produit"],
                  ]}
                />
              </Row>
              <Row label="Boutons">
                <Toggle checked={c.stickyButton} onChange={(v) => set("stickyButton", v)} label="Bouton fixe en bas de l'écran (mobile)" />
                <Toggle checked={c.cartButton} onChange={(v) => set("cartButton", v)} label="Bouton sur la page panier (commande tout le panier)" />
                <Toggle checked={c.hideAddToCart} onChange={(v) => set("hideAddToCart", v)} label="Cacher « Ajouter au panier »" />
                <Toggle checked={c.hideBuyNow} onChange={(v) => set("hideBuyNow", v)} label="Cacher « Acheter maintenant »" />
              </Row>
              <Row label="Cacher d'autres boutons" hint="Sélecteurs CSS cachés là où notre formulaire s'affiche (par défaut : bouton Releasit).">
                <Input value={c.hideSelectors} onChange={(e) => set("hideSelectors", e.target.value)} />
              </Row>
              <Row label="Page de remerciement" hint="Vide = message dans le formulaire.">
                <Input value={c.thankYouUrl} placeholder="https://…" onChange={(e) => set("thankYouUrl", e.target.value)} />
              </Row>
              <Row label="Inscription newsletter">
                <Toggle checked={c.newsletter} onChange={(v) => set("newsletter", v)} label="Afficher la case" />
              </Row>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Champs ── */}
        <TabsContent value="fields">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Champs du formulaire</CardTitle>
              <CardDescription>Nom et téléphone sont toujours affichés et obligatoires. Flèches pour changer l&apos;ordre.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {c.fields.map((f, i) => {
                const upd = (p: Partial<FieldConfig>) => set("fields", c.fields.map((x, j) => (j === i ? { ...x, ...p } : x)));
                const move = (d: number) => {
                  const arr = [...c.fields];
                  const [x] = arr.splice(i, 1);
                  arr.splice(i + d, 0, x);
                  set("fields", arr);
                };
                const locked = f.key === "name" || f.key === "phone";
                return (
                  <div key={f.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[100px_1fr_1fr_auto] sm:items-center">
                    <span className="text-muted-foreground text-xs">{f.key}</span>
                    <Input value={f.label} onChange={(e) => upd({ label: e.target.value })} aria-label="Libellé" />
                    <Input value={f.placeholder} placeholder="Texte d'exemple" onChange={(e) => upd({ placeholder: e.target.value })} />
                    <div className="flex items-center gap-1">
                      <Toggle checked={f.show} onChange={(v) => !locked && upd({ show: v })} label="Visible" />
                      <Toggle checked={f.required} onChange={(v) => !locked && upd({ required: v })} label="Obligatoire" />
                      <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(-1)} aria-label="Monter">
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={i === c.fields.length - 1} onClick={() => move(1)} aria-label="Descendre">
                        <ArrowDown className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Row label="Liste de villes" hint="Une par ligne. Remplie = la ville devient une liste déroulante.">
                <Textarea rows={5} defaultValue={c.cityList.join("\n")} onChange={(e) => set("cityList", parseList(e.target.value))} />
              </Row>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Textes & style ── */}
        <TabsContent value="look">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <Row label="Style du thème" hint="Boutons et titres reprennent la police, les majuscules et les coins du bouton « Ajouter au panier » de votre thème.">
                <Choice value={c.design.matchTheme ? "yes" : "no"} onChange={(v) => set("design", { ...c.design, matchTheme: v === "yes" })} options={[["yes", "Comme le thème"], ["no", "Réglages ci-dessous"]]} />
              </Row>
              <Row label="Disposition du formulaire">
                <Choice value={c.design.layout} onChange={(v) => set("design", { ...c.design, layout: v as "icons" | "simple" })} options={[["icons", "Icônes dans les champs (comme Releasit)"], ["simple", "Simple (libellés au-dessus)"]]} />
              </Row>
              <Row label="Couleur principale">
                <div className="flex gap-2">
                  <input type="color" value={c.colors.primary} onChange={(e) => set("colors", { ...c.colors, primary: e.target.value })} />
                  <Input value={c.colors.primary} onChange={(e) => set("colors", { ...c.colors, primary: e.target.value })} />
                </div>
              </Row>
              <Row label="Couleur du texte des boutons">
                <div className="flex gap-2">
                  <input type="color" value={c.colors.primaryText} onChange={(e) => set("colors", { ...c.colors, primaryText: e.target.value })} />
                  <Input value={c.colors.primaryText} onChange={(e) => set("colors", { ...c.colors, primaryText: e.target.value })} />
                </div>
              </Row>
              <Row label="Arrondi des boutons (px)" hint="Ignoré quand le style du thème est activé.">
                <Input type="number" min={0} max={30} value={c.colors.radius} onChange={(e) => set("colors", { ...c.colors, radius: Number(e.target.value) })} />
              </Row>
              <Row label="Sens d'écriture">
                <Choice value={c.dir} onChange={(v) => set("dir", v)} options={[["ltr", "Gauche → droite (français)"], ["rtl", "Droite → gauche (arabe)"]]} />
              </Row>
              <Row label="Devise affichée">
                <Input value={c.currencyLabel} onChange={(e) => set("currencyLabel", e.target.value)} />
              </Row>
              {(Object.keys(c.texts) as (keyof Texts)[]).map((k) => (
                <Row key={k} label={TEXT_LABELS[k] ?? k}>
                  <Input value={c.texts[k]} onChange={(e) => setText(k, e.target.value)} />
                </Row>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Offres quantité ── */}
        <TabsContent value="offers">
          <OffersEditor offers={c.offers} onChange={(v) => set("offers", v)} />
        </TabsContent>

        {/* ── Upsells ── */}
        <TabsContent value="upsells">
          <UpsellsEditor ticks={c.tickUpsells} clicks={c.clickUpsells} onTicks={(v) => set("tickUpsells", v)} onClicks={(v) => set("clickUpsells", v)} />
        </TabsContent>

        {/* ── Livraison ── */}
        <TabsContent value="shipping">
          <RatesEditor rates={c.shippingRates} onChange={(v) => set("shippingRates", v)} />
          <Card className="mt-4">
            <CardContent className="flex flex-col gap-3 pt-6">
              <Row label="Frais de paiement à la livraison" hint="Ajoutés à chaque commande (0 = aucun).">
                <Money value={c.codFee.cents} onChange={(v) => set("codFee", { ...c.codFee, cents: v ?? 0 })} />
              </Row>
              <Row label="Libellé des frais">
                <Input value={c.codFee.label} onChange={(e) => set("codFee", { ...c.codFee, label: e.target.value })} />
              </Row>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Codes promo ── */}
        <TabsContent value="promo">
          <PromoEditor enabled={c.discountCodes} codes={c.promoCodes} onEnabled={(v) => set("discountCodes", v)} onChange={(v) => set("promoCodes", v)} />
        </TabsContent>

        {/* ── Anti-fraude ── */}
        <TabsContent value="fraud">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <Row label="Commandes par téléphone" hint="Maximum, puis fenêtre en minutes.">
                <div className="flex gap-2">
                  <Input type="number" min={1} value={c.fraud.maxPerPhone} onChange={(e) => setFraud("maxPerPhone", Number(e.target.value))} />
                  <Input type="number" min={1} value={c.fraud.phoneWindowMin} onChange={(e) => setFraud("phoneWindowMin", Number(e.target.value))} />
                </div>
              </Row>
              <Row label="Commandes par adresse IP" hint="Maximum, puis fenêtre en minutes.">
                <div className="flex gap-2">
                  <Input type="number" min={1} value={c.fraud.maxPerIp} onChange={(e) => setFraud("maxPerIp", Number(e.target.value))} />
                  <Input type="number" min={1} value={c.fraud.ipWindowMin} onChange={(e) => setFraud("ipWindowMin", Number(e.target.value))} />
                </div>
              </Row>
              <Row label="Quantité maximale par commande">
                <Input type="number" min={1} value={c.fraud.maxQty} onChange={(e) => setFraud("maxQty", Number(e.target.value))} />
              </Row>
              <Row label="Téléphones bloqués" hint="Un par ligne.">
                <Textarea rows={4} defaultValue={c.fraud.blockedPhones.join("\n")} onChange={(e) => setFraud("blockedPhones", parseList(e.target.value))} />
              </Row>
              <Row label="Adresses IP bloquées" hint="Une par ligne.">
                <Textarea rows={3} defaultValue={c.fraud.blockedIps.join("\n")} onChange={(e) => setFraud("blockedIps", parseList(e.target.value))} />
              </Row>
              <p className="text-muted-foreground text-xs">
                Vérification par code SMS / WhatsApp (OTP) : nécessite un fournisseur payant, pas encore activée.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pixels ── */}
        <TabsContent value="pixels">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <Row label="Meta (Facebook)" hint="ID de pixel. L'envoi serveur (Conversions API) utilise META_CAPI_TOKEN.">
                <Input defaultValue={list(c.pixels.meta)} onChange={(e) => set("pixels", { ...c.pixels, meta: parseList(e.target.value) })} />
              </Row>
              <Row label="TikTok" hint="ID de pixel (ex. C4ABC…).">
                <Input defaultValue={list(c.pixels.tiktok)} onChange={(e) => set("pixels", { ...c.pixels, tiktok: parseList(e.target.value) })} />
              </Row>
              <Row label="Google Ads" hint="Format AW-123456789/libellé-conversion, séparés par des virgules.">
                <Input
                  defaultValue={c.pixels.google.map((g) => (g.label ? `${g.id}/${g.label}` : g.id)).join(", ")}
                  onChange={(e) =>
                    set("pixels", {
                      ...c.pixels,
                      google: parseList(e.target.value).map((s) => {
                        const [id, label] = s.split("/");
                        return { id: id.trim(), label: (label ?? "").trim() };
                      }),
                    })
                  }
                />
              </Row>
              <Row label="Snapchat" hint="Pixel ID.">
                <Input defaultValue={list(c.pixels.snapchat)} onChange={(e) => set("pixels", { ...c.pixels, snapchat: parseList(e.target.value) })} />
              </Row>
              <Row label="Pinterest" hint="Tag ID.">
                <Input defaultValue={list(c.pixels.pinterest)} onChange={(e) => set("pixels", { ...c.pixels, pinterest: parseList(e.target.value) })} />
              </Row>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const TEXT_LABELS: Partial<Record<keyof Texts, string>> = {
  shippingMethod: "Titre « Mode de livraison »",
  button: "Bouton sur la page produit",
  title: "Titre du formulaire",
  submit: "Bouton de validation",
  addressTitle: "Titre de l'adresse",
  quantity: "Quantité",
  shipping: "Livraison",
  freeShipping: "Livraison gratuite",
  subtotal: "Sous-total",
  total: "Total",
  discount: "Réduction",
  discountPlaceholder: "Champ code promo",
  discountApply: "Bouton code promo",
  newsletter: "Case newsletter",
  note: "Note sous le bouton",
  thankYou: "Message de remerciement",
  upsellAccept: "Upsell : accepter",
  upsellDecline: "Upsell : refuser",
  offerTitle: "Titre des offres",
  piece: "Pièce (offres multi-pièces)",
};

// ── quantity offers ──────────────────────────────────────────────────────────
const TIER_TYPES: [TierType, string][] = [
  ["none", "Prix normal"],
  ["percent", "% de réduction"],
  ["fixed", "Montant de réduction"],
  ["price", "Prix total du lot"],
  ["free", "Pièces offertes"],
];

function OffersEditor({ offers, onChange }: { offers: QuantityOffer[]; onChange: (v: QuantityOffer[]) => void }) {
  const upd = (i: number, p: Partial<QuantityOffer>) => onChange(offers.map((o, j) => (j === i ? { ...o, ...p } : o)));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Offres par quantité</CardTitle>
        <CardDescription>
          Ex. « 1 pièce », « 2 pièces -20 % », « Achetez 1, la 2e offerte ». Le client choisit une offre, puis la taille et
          la couleur de chaque pièce. La réduction apparaît sur la commande sous « QUANTITY DISCOUNT », comme Releasit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {offers.map((o, i) => (
          <div key={o.id} className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex gap-2">
              <Input value={o.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Nom de l'offre" />
              <Remove onClick={() => onChange(offers.filter((_, j) => j !== i))} />
            </div>
            <Row label="Produits" hint="Handles, virgules, ou *.">
              <Input defaultValue={list(o.products)} onChange={(e) => upd(i, { products: parseList(e.target.value).map((s) => s.toLowerCase()) })} />
            </Row>
            {o.tiers.map((t, k) => {
              const ut = (p: Partial<OfferTier>) => upd(i, { tiers: o.tiers.map((x, j) => (j === k ? { ...x, ...p } : x)) });
              return (
                <div key={k} className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[70px_1fr_120px_1fr_1fr_auto] sm:items-center">
                  <Input type="number" min={1} max={10} value={t.qty} onChange={(e) => ut({ qty: Number(e.target.value) })} aria-label="Quantité" />
                  <Choice value={t.type} onChange={(v) => ut({ type: v })} options={TIER_TYPES} />
                  {t.type === "fixed" || t.type === "price" ? (
                    <Money value={t.value} onChange={(v) => ut({ value: v ?? 0 })} />
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      value={t.value}
                      disabled={t.type === "none"}
                      onChange={(e) => ut({ value: Number(e.target.value) })}
                      aria-label={t.type === "percent" ? "%" : "Pièces"}
                    />
                  )}
                  <Input value={t.label} placeholder="Libellé (ex. 2 pièces -20 %)" onChange={(e) => ut({ label: e.target.value })} />
                  <Input value={t.badge} placeholder="Badge (ex. Le plus choisi)" onChange={(e) => ut({ badge: e.target.value })} />
                  <div className="flex items-center gap-1">
                    <Toggle
                      checked={t.preselected}
                      onChange={(v) => upd(i, { tiers: o.tiers.map((x, j) => ({ ...x, preselected: j === k ? v : false })) })}
                      label="Par défaut"
                    />
                    <Remove onClick={() => upd(i, { tiers: o.tiers.filter((_, j) => j !== k) })} />
                  </div>
                </div>
              );
            })}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const q = (o.tiers[o.tiers.length - 1]?.qty ?? 0) + 1;
                  upd(i, { tiers: [...o.tiers, { qty: q, type: "percent", value: 10, label: `${q} pièces`, badge: "", preselected: false }] });
                }}
              >
                <Plus className="size-4" />
                Palier
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange([
                ...offers,
                {
                  id: uid("offer"),
                  name: "Nouvelle offre",
                  products: [],
                  tiers: [
                    { qty: 1, type: "none", value: 0, label: "1 pièce", badge: "", preselected: true },
                    { qty: 2, type: "percent", value: 15, label: "2 pièces -15 %", badge: "Le plus choisi", preselected: false },
                  ],
                },
              ])
            }
          >
            <Plus className="size-4" />
            Ajouter une offre
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── upsells ──────────────────────────────────────────────────────────────────
function UpsellsEditor({
  ticks,
  clicks,
  onTicks,
  onClicks,
}: {
  ticks: TickUpsell[];
  clicks: ClickUpsell[];
  onTicks: (v: TickUpsell[]) => void;
  onClicks: (v: ClickUpsell[]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upsells 1-clic dans le formulaire (cases à cocher)</CardTitle>
          <CardDescription>
            Un petit produit en plus (emballage cadeau, accessoire). ID de variante Shopify : dans l&apos;URL de la variante, ou
            « ?variant=… » sur la boutique.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {ticks.map((u, i) => {
            const upd = (p: Partial<TickUpsell>) => onTicks(ticks.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <div key={u.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_160px_130px_1fr_auto] sm:items-center">
                <Input value={u.label} placeholder="Texte de la case" onChange={(e) => upd({ label: e.target.value })} />
                <Input value={u.variantId} placeholder="ID de variante" onChange={(e) => upd({ variantId: e.target.value.trim() })} />
                <Money value={u.priceCents} onChange={(v) => upd({ priceCents: v ?? 0 })} placeholder="Prix spécial" />
                <Input defaultValue={list(u.products)} placeholder="Produits (* = tous)" onChange={(e) => upd({ products: parseList(e.target.value) })} />
                <Remove onClick={() => onTicks(ticks.filter((_, j) => j !== i))} />
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onTicks([...ticks, { id: uid("tick"), variantId: "", label: "Ajouter un emballage cadeau", priceCents: 0, products: ["*"] }])}
            >
              <Plus className="size-4" />
              Case à cocher
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upsell en fenêtre avant validation, et downsell</CardTitle>
          <CardDescription>
            Proposé quand le client valide. S&apos;il refuse, le downsell (moins cher) peut être proposé. Ajouté à la même commande ;
            l&apos;écart de prix apparaît sous « CUSTOM DISCOUNT », comme Releasit.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {clicks.map((u, i) => {
            const upd = (p: Partial<ClickUpsell>) => onClicks(clicks.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <div key={u.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex gap-2">
                  <Input value={u.headline} placeholder="Titre" onChange={(e) => upd({ headline: e.target.value })} />
                  <Remove onClick={() => onClicks(clicks.filter((_, j) => j !== i))} />
                </div>
                <Input value={u.text} placeholder="Texte" onChange={(e) => upd({ text: e.target.value })} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input value={u.variantId} placeholder="ID de variante" onChange={(e) => upd({ variantId: e.target.value.trim() })} />
                  <Money value={u.priceCents} onChange={(v) => upd({ priceCents: v ?? 0 })} placeholder="Prix spécial" />
                  <Input defaultValue={list(u.products)} placeholder="Produits (* = tous)" onChange={(e) => upd({ products: parseList(e.target.value) })} />
                </div>
                <Toggle
                  checked={u.downsell.enabled}
                  onChange={(v) => upd({ downsell: { ...u.downsell, enabled: v } })}
                  label="Proposer un downsell si refus"
                />
                {u.downsell.enabled ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={u.downsell.headline} placeholder="Titre du downsell" onChange={(e) => upd({ downsell: { ...u.downsell, headline: e.target.value } })} />
                    <Money value={u.downsell.priceCents} onChange={(v) => upd({ downsell: { ...u.downsell, priceCents: v ?? 0 } })} placeholder="Prix du downsell" />
                  </div>
                ) : null}
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onClicks([
                  ...clicks,
                  {
                    id: uid("click"),
                    variantId: "",
                    headline: "Complétez votre look",
                    text: "",
                    priceCents: 0,
                    products: ["*"],
                    downsell: { enabled: false, headline: "Dernière chance", priceCents: 0 },
                  },
                ])
              }
            >
              <Plus className="size-4" />
              Upsell en fenêtre
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── shipping rates ───────────────────────────────────────────────────────────
function RatesEditor({ rates, onChange }: { rates: ShippingRate[]; onChange: (v: ShippingRate[]) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Frais de livraison</CardTitle>
        <CardDescription>
          Le premier tarif dont les conditions correspondent est appliqué. Aucun tarif = livraison gratuite.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rates.map((r, i) => {
          const upd = (p: Partial<ShippingRate>) => onChange(rates.map((x, j) => (j === i ? { ...x, ...p } : x)));
          const move = (d: number) => {
            const arr = [...rates];
            const [x] = arr.splice(i, 1);
            arr.splice(i + d, 0, x);
            onChange(arr);
          };
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-md border p-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-center">
                <Input value={r.name} placeholder="Nom (ex. Livraison standard)" onChange={(e) => upd({ name: e.target.value })} />
                <Money value={r.priceCents} onChange={(v) => upd({ priceCents: v ?? 0 })} placeholder="Prix" />
                <div className="flex">
                  <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(-1)} aria-label="Monter">
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={i === rates.length - 1} onClick={() => move(1)} aria-label="Descendre">
                    <ArrowDown className="size-4" />
                  </Button>
                  <Remove onClick={() => onChange(rates.filter((_, j) => j !== i))} />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <Money value={r.minTotalCents} onChange={(v) => upd({ minTotalCents: v })} placeholder="Total min." />
                <Money value={r.maxTotalCents} onChange={(v) => upd({ maxTotalCents: v })} placeholder="Total max." />
                <Input
                  type="number"
                  min={1}
                  value={r.minQty ?? ""}
                  placeholder="Pièces min."
                  onChange={(e) => upd({ minQty: e.target.value ? Number(e.target.value) : null })}
                />
                <Input defaultValue={list(r.cities)} placeholder="Villes (vide = toutes)" onChange={(e) => upd({ cities: parseList(e.target.value) })} />
              </div>
            </div>
          );
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange([...rates, { id: uid("rate"), name: "Livraison", priceCents: 0, minTotalCents: null, maxTotalCents: null, minQty: null, cities: [] }])
            }
          >
            <Plus className="size-4" />
            Tarif
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── promo codes ──────────────────────────────────────────────────────────────
function PromoEditor({
  enabled,
  codes,
  onEnabled,
  onChange,
}: {
  enabled: boolean;
  codes: PromoCodeConfig[];
  onEnabled: (v: boolean) => void;
  onChange: (v: PromoCodeConfig[]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Codes promo</CardTitle>
        <CardDescription>
          Les codes ci-dessous, et les codes de réduction Shopify (pourcentage, montant, livraison gratuite) quand l&apos;app a
          l&apos;autorisation de lire les réductions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Toggle checked={enabled} onChange={onEnabled} label="Afficher le champ « code promo » dans le formulaire" />
        {codes.map((p, i) => {
          const upd = (x: Partial<PromoCodeConfig>) => onChange(codes.map((y, j) => (j === i ? { ...y, ...x } : y)));
          return (
            <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_120px_140px_auto] sm:items-center">
              <Input value={p.code} placeholder="CODE" onChange={(e) => upd({ code: e.target.value.toUpperCase() })} />
              <Choice
                value={p.kind}
                onChange={(v) => upd({ kind: v })}
                options={[
                  ["percent", "% de réduction"],
                  ["fixed", "Montant de réduction"],
                  ["free_shipping", "Livraison gratuite"],
                ]}
              />
              {p.kind === "percent" ? (
                <Input type="number" min={0} max={100} value={p.value} onChange={(e) => upd({ value: Number(e.target.value) })} />
              ) : p.kind === "fixed" ? (
                <Money value={p.value} onChange={(v) => upd({ value: v ?? 0 })} />
              ) : (
                <span />
              )}
              <Money value={p.minSubtotalCents} onChange={(v) => upd({ minSubtotalCents: v })} placeholder="Minimum" />
              <Remove onClick={() => onChange(codes.filter((_, j) => j !== i))} />
            </div>
          );
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...codes, { code: "", kind: "percent", value: 10, minSubtotalCents: null }])}
          >
            <Plus className="size-4" />
            Code
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
