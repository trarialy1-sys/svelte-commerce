import { IntegrationProvider } from "@/generated/prisma/client";
import { getAuthContext, meetsOrgRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { ModulePage } from "@/components/module/module-page";
import { catalogConfig } from "@/modules/catalog/config";
import { SyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { orgId, appRole } = await getAuthContext();

  let lastSyncAt: string | null = null;
  if (orgId) {
    const integ = await getOrgDb(orgId).integration.findUnique({
      where: {
        orgId_provider: { orgId, provider: IntegrationProvider.SHOPIFY },
      },
      select: { meta: true },
    });
    const meta = integ?.meta as { lastCatalogSyncAt?: string } | null;
    lastSyncAt = meta?.lastCatalogSyncAt ?? null;
  }

  const canSync = meetsOrgRole(appRole, "admin");

  return (
    <ModulePage
      config={catalogConfig}
      role={appRole}
      actions={canSync ? <SyncButton lastSyncAt={lastSyncAt} /> : null}
    />
  );
}
