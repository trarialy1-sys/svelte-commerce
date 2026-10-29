"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { addArrival, saveCount, saveCountNote } from "@/lib/stock/count";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

export async function saveCountAction(
  variantId: string,
  qty: number,
  by: string,
  note?: string | null
): Promise<Result<{ qty: number }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const r = await saveCount(orgId!, { variantId, qty, by, note }, userId);
    revalidatePath("/stock");
    revalidatePath("/dashboard");
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec." };
  }
}

export async function saveCountNoteAction(variantId: string, note: string): Promise<Result<null>> {
  const { orgId } = await requireOrgRole("operator");
  try {
    await saveCountNote(orgId!, variantId, note);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec." };
  }
}

export async function addArrivalAction(
  variantId: string,
  qty: number,
  by: string
): Promise<Result<{ qty: number | undefined }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const r = await addArrival(orgId!, { variantId, qty, by }, userId);
    revalidatePath("/stock");
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec." };
  }
}
