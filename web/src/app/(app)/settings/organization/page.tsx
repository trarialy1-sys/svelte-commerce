import { MapPin } from "lucide-react";

import { getAuthContext, meetsOrgRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrgSettings } from "@/lib/org/settings";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CityCatalogButton } from "../city-catalog-button";
import { OrganizationForm } from "./organization-form";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage() {
  const { orgId, appRole } = await getAuthContext();
  const canEdit = meetsOrgRole(appRole, "admin");
  const isAdmin = canEdit;

  const settings = orgId ? await getOrgSettings(orgId) : null;
  const cityCount = isAdmin ? await db.cityCatalog.count() : 0;

  return (
    <>
      <PageHeader
        title="Organisation"
        subtitle="Profil, image de marque et préférences régionales."
      />

      {settings ? (
        <OrganizationForm
          canEdit={canEdit}
          initial={{
            name: settings.name,
            logoUrl: settings.logoUrl ?? "",
            locale: settings.locale,
            timezone: settings.timezone,
            currency: settings.currency,
          }}
        />
      ) : (
        <p className="text-muted-foreground text-sm">Aucune organisation active.</p>
      )}

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
              {cityCount > 0 ? `${cityCount} villes chargées` : "Aucune ville chargée"}
            </p>
            <CityCatalogButton />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
