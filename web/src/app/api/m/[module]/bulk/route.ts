import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext, meetsOrgRole, type AppRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { getModule } from "@/lib/module/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ module: string }> }
) {
  const { module } = await params;
  const entry = getModule(module);
  if (!entry) {
    return NextResponse.json({ error: "Unknown module" }, { status: 404 });
  }

  const { userId, orgId, appRole } = await getAuthContext();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  let body: { ids?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string")
    : [];
  const action = typeof body.action === "string" ? body.action : "";
  if (ids.length === 0 || !action) {
    return NextResponse.json({ error: "ids and action required" }, { status: 400 });
  }

  const bulkAction = entry.config.bulkActions?.find((a) => a.key === action);
  const handler = entry.bulkHandlers?.[action];
  if (!bulkAction || !handler) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Role gate (server-authoritative).
  if (bulkAction.minRole) {
    const min = bulkAction.minRole.toLowerCase() as AppRole;
    if (!meetsOrgRole(appRole, min)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await handler(orgId, ids, { userId });

  // Audit log (org-scoped, RLS-protected).
  await getOrgDb(orgId).auditLog.create({
    data: {
      orgId,
      action: `bulk.${action}`,
      entity: entry.config.model,
      actorUserId: userId,
      meta: { ids, updated: result.updated },
    },
  });

  return NextResponse.json(result);
}
