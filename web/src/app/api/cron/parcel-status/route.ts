import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { syncParcelStatuses } from "@/lib/shipping/status-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cap to the function's allowance; the sync itself only polls non-terminal parcels.
export const maxDuration = 300;

/**
 * Scheduled parcel-status sync (Vercel Cron — see web/vercel.json). Runs as the
 * system: no user session, protected by CRON_SECRET. Loops active orgs and syncs
 * each org's parcels with that org's own credentials (RLS-isolated).
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const orgs = await db.organization.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  let totalUpdated = 0;
  const perOrg: Array<Record<string, unknown>> = [];
  for (const o of orgs) {
    try {
      const r = await syncParcelStatuses(o.id);
      totalUpdated += r.updated;
      perOrg.push({ orgId: o.id, ...r });
    } catch (e) {
      perOrg.push({ orgId: o.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, orgs: orgs.length, totalUpdated, perOrg });
}
