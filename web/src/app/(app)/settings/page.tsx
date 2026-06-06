import Link from "next/link";
import { MapPin, Plug, Users } from "lucide-react";

import { db } from "@/lib/db";
import { getAuthContext, meetsOrgRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CityCatalogButton } from "./city-catalog-button";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/settings/integrations",
    title: "Intégrations",
    description: "Connectez Shopify et OzonExpress (clés chiffrées).",
    icon: Plug,
  },
  {
    href: "/settings/team",
    title: "Équipe",
    description: "Membres et rôles de l'organisation.",
    icon: Users,
  },
];

export default async function SettingsPage() {
  const { appRole } = await getAuthContext();
  const isAdmin = meetsOrgRole(appRole, "admin");
  // CityCatalog is a global table — count is shared across orgs.
  const cityCount = await db.cityCatalog.count();

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Configuration de l'organisation." />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.href}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <CardDescription>{s.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link href={s.href}>Ouvrir</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {isAdmin ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
                  <MapPin className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-base">Catalogue des villes</CardTitle>
                  <CardDescription>
                    Villes OzonExpress utilisées pour la résolution d&apos;adresse.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">
                {cityCount > 0
                  ? `${cityCount} villes chargées`
                  : "Aucune ville chargée"}
              </p>
              <CityCatalogButton />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
