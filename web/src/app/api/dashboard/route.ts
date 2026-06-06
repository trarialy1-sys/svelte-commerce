import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, orgId, appRole } = await getAuthContext();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  const summary = await getDashboardSummary(orgId, appRole);
  return NextResponse.json(summary);
}
