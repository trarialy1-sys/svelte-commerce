import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import type { SafeIntegration } from "@/lib/integrations/types";
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

  return (
    <IntegrationsClient
      integrations={integrations}
      isOwner={appRole === "owner"}
    />
  );
}
