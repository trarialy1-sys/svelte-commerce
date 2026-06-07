"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { requireOrgRole } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function guard() {
  // Entire Finance area is owner/admin only.
  const { orgId, userId } = await requireOrgRole("admin");
  return { orgId: orgId!, userId };
}

async function audit(
  orgId: string,
  actorUserId: string | null | undefined,
  action: string,
  entityId: string | null,
  meta: Prisma.InputJsonObject
): Promise<void> {
  await getOrgDb(orgId).auditLog.create({
    data: { orgId, actorUserId: actorUserId ?? null, action, entity: "Remittance", entityId, meta },
  });
}

function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function parseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function addRemittanceAction(input: {
  amount: string;
  date: string;
  reference?: string;
  note?: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const amount = parseAmount(input.amount);
  const date = parseDate(input.date);
  if (amount === null) return { ok: false, message: "Montant invalide." };
  if (!date) return { ok: false, message: "Date invalide." };

  const r = await getOrgDb(orgId).remittance.create({
    data: {
      orgId,
      amount: new Prisma.Decimal(amount),
      date,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      createdById: userId,
    },
    select: { id: true },
  });
  await audit(orgId, userId, "finance.remittance_added", r.id, { amount, date: input.date });
  revalidatePath("/finance");
  return { ok: true };
}

export async function updateRemittanceAction(input: {
  id: string;
  amount: string;
  date: string;
  reference?: string;
  note?: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const amount = parseAmount(input.amount);
  const date = parseDate(input.date);
  if (amount === null) return { ok: false, message: "Montant invalide." };
  if (!date) return { ok: false, message: "Date invalide." };

  await getOrgDb(orgId).remittance.update({
    where: { id: input.id },
    data: {
      amount: new Prisma.Decimal(amount),
      date,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
    },
  });
  await audit(orgId, userId, "finance.remittance_updated", input.id, { amount });
  revalidatePath("/finance");
  return { ok: true };
}

export async function deleteRemittanceAction(input: {
  id: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  await getOrgDb(orgId).remittance.delete({ where: { id: input.id } });
  await audit(orgId, userId, "finance.remittance_deleted", input.id, {});
  revalidatePath("/finance");
  return { ok: true };
}

function parseFee(raw: string | undefined): Prisma.Decimal | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? new Prisma.Decimal(n) : null;
}

export async function updateFeesAction(input: {
  shippingFeePerParcel?: string;
  codCommissionPct?: string;
  returnFee?: string;
}): Promise<ActionResult> {
  const { orgId, userId } = await guard();
  const data = {
    shippingFeePerParcel: parseFee(input.shippingFeePerParcel),
    codCommissionPct: parseFee(input.codCommissionPct),
    returnFee: parseFee(input.returnFee),
  };
  await getOrgDb(orgId).financeSettings.upsert({
    where: { orgId },
    create: { orgId, ...data },
    update: data,
  });
  await audit(orgId, userId, "finance.fees_updated", null, {
    shippingFeePerParcel: data.shippingFeePerParcel?.toString() ?? null,
    codCommissionPct: data.codCommissionPct?.toString() ?? null,
    returnFee: data.returnFee?.toString() ?? null,
  });
  revalidatePath("/finance");
  return { ok: true };
}
