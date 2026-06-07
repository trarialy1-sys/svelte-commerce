"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth";
import { commitImport, dryRunImport } from "@/lib/import/adapters";
import {
  ENTITY_FIELDS,
  type CommitResult,
  type DryRunResult,
  type ImportEntity,
  type MappedRow,
} from "@/lib/import/types";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const MAX_ROWS = 5000;

function valid(entity: string, rows: unknown): entity is ImportEntity {
  return entity in ENTITY_FIELDS && Array.isArray(rows);
}

export async function dryRunImportAction(
  entity: ImportEntity,
  rows: MappedRow[]
): Promise<Result<DryRunResult>> {
  const { orgId } = await requireOrgRole("operator");
  if (!valid(entity, rows)) return { ok: false, message: "Entrée invalide." };
  if (rows.length === 0) return { ok: false, message: "Aucune ligne à importer." };
  if (rows.length > MAX_ROWS)
    return { ok: false, message: `Maximum ${MAX_ROWS} lignes par import.` };
  const data = await dryRunImport(orgId!, entity, rows);
  return { ok: true, data };
}

const REVALIDATE: Record<ImportEntity, string[]> = {
  orders: ["/orders", "/dashboard"],
  customers: ["/customers"],
  products: ["/products", "/stock"],
};

export async function commitImportAction(
  entity: ImportEntity,
  rows: MappedRow[]
): Promise<Result<CommitResult>> {
  const { orgId, userId } = await requireOrgRole("operator");
  if (!valid(entity, rows)) return { ok: false, message: "Entrée invalide." };
  if (rows.length === 0) return { ok: false, message: "Aucune ligne à importer." };
  if (rows.length > MAX_ROWS)
    return { ok: false, message: `Maximum ${MAX_ROWS} lignes par import.` };
  const data = await commitImport(orgId!, entity, rows, userId);
  for (const p of REVALIDATE[entity]) revalidatePath(p);
  return { ok: true, data };
}
