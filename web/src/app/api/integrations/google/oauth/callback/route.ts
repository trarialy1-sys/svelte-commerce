import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { exchangeGoogleCode, verifyGoogleState } from "@/lib/integrations/google/oauth";
import { appBaseUrl } from "@/lib/integrations/shopify/oauth";
import { logError } from "@/lib/observability/logger";
import { saveGoogleConnection } from "@/lib/sheets/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(status: string): NextResponse {
  return NextResponse.redirect(`${appBaseUrl()}/settings/integrations?google=${status}`);
}

/**
 * Google OAuth callback. The signed `state` binds the org and the user who
 * clicked "Connecter Google"; the signed-in session must be that same user.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back("error_denied");
  const st = verifyGoogleState(q.get("state"));
  if (!st) return back("error_state");
  const ctx = await getAuthContext();
  if (!ctx.userId || ctx.userId !== st.userId || ctx.orgId !== st.orgId) return back("error_session");
  const code = q.get("code");
  if (!code) return back("error_code");
  try {
    const t = await exchangeGoogleCode(code);
    if (!t.refreshToken) return back("error_refresh");
    if (!t.scope.includes("spreadsheets")) return back("error_scope");
    await saveGoogleConnection(st.orgId, t.refreshToken, t.email);
    await getOrgDb(st.orgId).auditLog.create({
      data: { orgId: st.orgId, actorUserId: st.userId, action: "integration.connected", entity: "Integration", entityId: "GOOGLE_SHEETS" },
    });
    return back("connected");
  } catch (e) {
    logError("Google OAuth callback failed", e, { orgId: st.orgId, route: "google_oauth_callback" });
    return back("error_exchange");
  }
}
