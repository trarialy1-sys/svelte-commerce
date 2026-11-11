import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { shopifyRedirectUri } from "@/lib/integrations/shopify/oauth";
import type { SafeIntegration } from "@/lib/integrations/types";
import {
  backfillCutoff,
  backfillStatus,
  countOldUnfulfilled,
} from "@/lib/integrations/shopify/backfill-fulfil";
import { BackfillCard } from "./backfill-card";
import { IntegrationsClient } from "./integrations-client";

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
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <IntegrationsClient
        integrations={integrations}
        isOwner={appRole === "owner"}
        shopifyRedirectUri={shopifyRedirectUri()}
      />
      {backfill ? <BackfillCard initial={backfill} /> : null}
    </div>
  );
}
