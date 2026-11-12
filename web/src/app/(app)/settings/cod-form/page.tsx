import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { getAuthContext } from "@/lib/auth";
import { abandonedForms } from "@/lib/cod/leads";
import { getCodConfig } from "@/lib/cod/store";

import { CodFormEditor } from "./editor";
import { AbandonedList } from "./abandoned-list";

export const dynamic = "force-dynamic";

export default async function CodFormSettingsPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId || appRole !== "owner") redirect("/settings");
  const [config, leads] = await Promise.all([
    getCodConfig(orgId, true),
    abandonedForms(orgId).catch(() => []),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Formulaire de commande COD"
        subtitle="Tout ce que fait le formulaire sur la boutique : produits, champs, textes, offres, upsells, livraison, codes promo, anti-fraude, pixels."
      />
      <CodFormEditor initial={config} />
      <AbandonedList leads={leads} />
    </div>
  );
}
