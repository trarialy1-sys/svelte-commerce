import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { getModule } from "@/lib/module/registry";
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

  const { userId, orgId } = await getAuthContext();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 25 });
  }

  const listParams = parseListParams(req.nextUrl.searchParams, entry.config);
  const result = await listModule(orgId, entry.config, listParams);
  return NextResponse.json(result);
}
