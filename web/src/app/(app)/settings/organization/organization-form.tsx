"use client";

import * as React from "react";
import { toast } from "sonner";

import { CURRENCIES, LOCALES, TIMEZONES } from "@/lib/org/options";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateOrganizationAction } from "../actions";

interface Initial {
  name: string;
  logoUrl: string;
  locale: string;
  timezone: string;
  currency: string;
}

export function OrganizationForm({
  initial,
  canEdit,
}: {
  initial: Initial;
  canEdit: boolean;
}) {
  const [form, setForm] = React.useState<Initial>(initial);
  const [pending, startTransition] = React.useTransition();
  const disabled = !canEdit || pending;

  const set = <K extends keyof Initial>(key: K, value: Initial[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateOrganizationAction({
        name: form.name,
        logoUrl: form.logoUrl || null,
        locale: form.locale,
        timezone: form.timezone,
        currency: form.currency,
      });
      if (res.ok) toast.success("Organisation mise à jour.");
      else toast.error(res.message ?? "Échec de la mise à jour.");
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil de l&apos;organisation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="org-name">Nom</Label>
            <Input
              id="org-name"
              value={form.name}
              disabled={disabled}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="org-logo">URL du logo</Label>
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logoUrl}
                  alt=""
                  className="size-10 rounded-lg border object-cover"
                />
              ) : null}
              <Input
                id="org-logo"
                value={form.logoUrl}
                disabled={disabled}
                placeholder="https://…/logo.png"
                onChange={(e) => set("logoUrl", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Langue</Label>
            <Select
              value={form.locale}
              disabled={disabled}
              onValueChange={(v) => set("locale", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Devise</Label>
            <Select
              value={form.currency}
              disabled={disabled}
              onValueChange={(v) => set("currency", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label>Fuseau horaire</Label>
            <Select
              value={form.timezone}
              disabled={disabled}
              onValueChange={(v) => set("timezone", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Définit la limite « aujourd&apos;hui » du tableau de bord.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          {canEdit ? (
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Lecture seule — réservé aux administrateurs.
            </p>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
