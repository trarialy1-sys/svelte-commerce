import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { shopifyRedirectUri } from "@/lib/integrations/shopify/oauth";
import type { SafeIntegration } from "@/lib/integrations/types";
import {
  backfillCutoff,
  backfillStatus,
  countOldArchivable,
  countOldUnfulfilled,
} from "@/lib/integrations/shopify/backfill-fulfil";
import { BackfillCard } from "./backfill-card";
import { CodCard } from "./cod-card";
import { codOverview } from "@/lib/cod/install";
import { IntegrationsClient } from "./integrations-client";
import { SheetsCard } from "./sheets-card";
import { googleConfigured } from "@/lib/integrations/google/oauth";
import { sheetsOverview } from "@/lib/sheets/export";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { orgId, appRole } = await getAuthContext();

  let integrations: SafeIntegration[] = [];
  if (orgId) {
    // SELECT only safe fields — credentialsEnc never leaves the server.
    const rows = await getOrgDb(orgId).integration.findMany({
      select: { provider: true, status: true, meta: true, connectedAt: true },
    });
    integrations = rows.map((r) => ({
      provider: r.provider,
      status: r.status,
      meta: (r.meta ?? null) as Record<string, unknown> | null,
      connectedAt: r.connectedAt ? r.connectedAt.toISOString() : null,
    }));
  }

  const shopifyConnected = integrations.some(
    (i) => i.provider === "SHOPIFY" && i.status !== "disconnected"
  );
  const showBackfill = appRole === "owner" && shopifyConnected && Boolean(orgId);
  const backfill = showBackfill
    ? {
        ...(await backfillStatus(orgId!)),
        cutoff: backfillCutoff(),
        pending: await countOldUnfulfilled(orgId!, backfillCutoff()).catch(() => null),
        archivable: await countOldArchivable(orgId!, backfillCutoff()).catch(() => null),
      }
    : null;

  const cod = showBackfill ? await codOverview(orgId!).catch(() => null) : null;
  const sheets = appRole === "owner" && orgId ? await sheetsOverview(orgId).catch(() => null) : null;

  return (
    <div className="flex flex-col gap-6">
      <IntegrationsClient
        integrations={integrations}
        isOwner={appRole === "owner"}
        shopifyRedirectUri={shopifyRedirectUri()}
      />
      {cod ? <CodCard initial={cod} /> : null}
      {sheets ? <SheetsCard initial={sheets} configured={googleConfigured()} /> : null}
      {backfill ? <BackfillCard initial={backfill} /> : null}
    </div>
  );
}
