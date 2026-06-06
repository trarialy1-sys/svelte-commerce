"use server";

import { revalidatePath } from "next/cache";

import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";
import { refreshCityCatalog } from "@/lib/shipping/cities";

/** Load/refresh the global OzonExpress city catalog. Admin-only, audited. */
export async function refreshCityCatalogAction(): Promise<{
  ok: boolean;
  count?: number;
  message?: string;
}> {
  const { orgId, userId } = await requireOrgRole("admin");
  try {
    const { count } = await refreshCityCatalog();
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: "shipping.cities_refreshed",
        entity: "CityCatalog",
        meta: { count },
      },
    });
    revalidatePath("/settings");
    revalidatePath("/shipping");
    return { ok: true, count };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}
