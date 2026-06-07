import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sendOrgDigest } from "@/lib/digest/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily owner digest (Vercel Cron — see web/vercel.json, 06:30 UTC ≈ 07:30
 * Africa/Casablanca). System job: no session, protected by CRON_SECRET. Loops
 * active orgs and emails each org's owner/admin recipients (RLS-isolated).
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

  let sent = 0;
  const perOrg: Array<Record<string, unknown>> = [];
  for (const o of orgs) {
    try {
      const r = await sendOrgDigest(o.id);
      sent += r.sent;
      perOrg.push({ orgId: o.id, ...r });
    } catch (e) {
      perOrg.push({ orgId: o.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, orgs: orgs.length, sent, perOrg });
}
