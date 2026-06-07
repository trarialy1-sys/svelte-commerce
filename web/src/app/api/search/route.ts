import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { searchEntities, type SearchType } from "@/lib/search/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: SearchType[] = ["order", "customer", "product", "bl"];

export async function GET(req: NextRequest) {
  const { userId, orgId } = await getAuthContext();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ groups: [] });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ groups: [] });
  }

  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 5;

  const typesRaw = req.nextUrl.searchParams.get("types");
  const types = typesRaw
    ? (typesRaw.split(",").filter((t): t is SearchType => VALID.includes(t as SearchType)))
    : undefined;

  const groups = await searchEntities(orgId, q, { limit, types });
  return NextResponse.json({ groups });
}
