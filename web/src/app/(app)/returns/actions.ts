"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { confirmReturn, correctReturn } from "@/lib/shipping/returns";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

function done() {
  revalidatePath("/returns");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
}

/** Warehouse check: the returned parcel holds the right items. */
export async function confirmReturnAction(parcelId: string): Promise<Result<null>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    await confirmReturn(orgId!, parcelId, userId);
    done();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec." };
  }
}

/** Warehouse check: remove only the wrong items from stock again. */
export async function correctReturnAction(
  parcelId: string,
  skus: string[],
  note: string
): Promise<Result<{ removed: string[]; failed: string[] }>> {
  const { orgId, userId } = await requireOrgRole("operator");
  try {
    const res = await correctReturn(orgId!, parcelId, skus, note, userId);
    done();
    return {
      ok: true,
      data: {
        removed: res.filter((r) => r.ok).map((r) => `${r.sku} ${r.delta}`),
        failed: res.filter((r) => !r.ok).map((r) => `${r.sku} (${r.error})`),
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec." };
  }
}
