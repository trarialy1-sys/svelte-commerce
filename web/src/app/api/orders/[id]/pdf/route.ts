import { createElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { getAuthContext, meetsOrgRole } from "@/lib/auth";
import { getPackingData } from "@/lib/pdf/data";
import { PackingSlip } from "@/lib/pdf/packing-slip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, orgId, appRole } = await getAuthContext();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });
  if (!meetsOrgRole(appRole, "operator"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = req.nextUrl.searchParams.get("type") ?? "packing";
  if (type !== "packing") return NextResponse.json({ error: "Unknown type" }, { status: 400 });

  const data = await getPackingData(orgId, id);
  if (!data) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

  const buffer = await renderToBuffer(
    createElement(PackingSlip, data) as Parameters<typeof renderToBuffer>[0]
  );
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bon-preparation-${data.order.code}.pdf"`,
    },
  });
}
