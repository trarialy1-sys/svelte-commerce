"use server";

import { revalidatePath } from "next/cache";

import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";
import { syncCatalog } from "@/lib/integrations/shopify/sync";

export async function syncCatalogAction(): Promise<{
  ok: boolean;
  products?: number;
  variants?: number;
  message?: string;
}> {
  const { orgId, userId } = await requireOrgRole("admin");
  try {
    const counts = await syncCatalog(orgId!);
    await getOrgDb(orgId!).auditLog.create({
      data: {
        orgId: orgId!,
        actorUserId: userId,
        action: "catalog.synced",
        entity: "Variant",
        meta: counts,
      },
    });
    revalidatePath("/products");
    revalidatePath("/stock");
    return { ok: true, ...counts };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec" };
  }
}
