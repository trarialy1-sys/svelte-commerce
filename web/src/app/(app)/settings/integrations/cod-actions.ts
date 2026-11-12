"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { codOverview, installCodScript, removeCodScript, type CodOverview } from "@/lib/cod/install";

type Result = { ok: true; data: CodOverview } | { ok: false; message: string };

/** Put the COD form script on the storefront, or take it off. Owner only, audited. */
export async function setCodScriptAction(on: boolean): Promise<Result> {
  const { orgId, userId } = await requireOrgRole("owner");
  try {
    if (on) await installCodScript(orgId!);
    else await removeCodScript(orgId!);
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: on ? "cod.script_installed" : "cod.script_removed",
        entity: "Integration",
      },
    });
    revalidatePath("/settings/integrations");
    return { ok: true, data: await codOverview(orgId!) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Échec" };
  }
}
