import { createElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { getAuthContext, meetsOrgRole } from "@/lib/auth";
import { getPickingData } from "@/lib/pdf/data";
import { PickingList } from "@/lib/pdf/picking-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, orgId, appRole } = await getAuthContext();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });
  if (!meetsOrgRole(appRole, "operator"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ?ids=a,b,c for a selected batch; omitted = the whole "Prêtes" queue.
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const data = await getPickingData(orgId, ids);
  if (data.orders.length === 0)
    return NextResponse.json({ error: "Aucune commande prête." }, { status: 404 });

  const buffer = await renderToBuffer(
    createElement(PickingList, data) as Parameters<typeof renderToBuffer>[0]
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="liste-prelevement-${date}.pdf"`,
    },
  });
}
