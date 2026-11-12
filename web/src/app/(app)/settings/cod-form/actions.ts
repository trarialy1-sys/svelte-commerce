"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import type { CodConfig } from "@/lib/cod/config";
import { saveCodConfig } from "@/lib/cod/store";
import { getOrgDb } from "@/lib/db";

/** Save the COD form settings. Owner only, audited; input is sanitized server-side. */
export async function saveCodConfigAction(
  input: unknown
): Promise<{ ok: true; config: CodConfig } | { ok: false; message: string }> {
  const { orgId, userId } = await requireOrgRole("owner");
  try {
    const config = await saveCodConfig(orgId!, input);
    await getOrgDb(orgId!).auditLog.create({
      data: { orgId: orgId!, actorUserId: userId, action: "cod.settings_saved", entity: "Integration", entityId: "COD_FORM" },
    });
    revalidatePath("/settings/cod-form");
    revalidatePath("/settings/integrations");
    return { ok: true, config };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Échec" };
  }
}
