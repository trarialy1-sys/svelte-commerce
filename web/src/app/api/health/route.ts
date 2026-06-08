import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for the uptime monitor (Pass B). Checks DB
 * connectivity over the pooled runtime URL with a trivial `SELECT 1`. Returns
 * 200 when healthy, 503 otherwise. Deliberately leaks nothing — no error
 * detail, no env, no version — since this route is public (see proxy.ts).
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
