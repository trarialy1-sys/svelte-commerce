import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { getModule, moduleAllowed } from "@/lib/module/registry";
import { listModule, parseListParams } from "@/lib/module/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
    return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 25 });
  }
  if (!moduleAllowed(entry.config, appRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const listParams = parseListParams(req.nextUrl.searchParams, entry.config);
  const result = entry.list
    ? await entry.list(orgId, listParams, { appRole })
    : await listModule(orgId, entry.config, listParams);
  return NextResponse.json(result);
}
