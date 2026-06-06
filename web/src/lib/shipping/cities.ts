import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const CITIES_URL = "https://api.ozonexpress.ma/cities";

export interface ParsedCity {
  id: number;
  name: string;
  region: string | null;
  raw: unknown;
}

/**
 * Parse the public OzonExpress `/cities` payload. Shape:
 *   { "CITIES": { "37": { ID, NAME, REF?, ... }, ... } }
 * Defensive about field casing; keeps the full entry in `raw` so nothing is
 * lost. Pure (no I/O) so the parsing is unit-testable without the network.
 */
export function parseCities(payload: unknown): ParsedCity[] {
  const cities = (payload as { CITIES?: unknown } | null)?.CITIES;
  if (!cities || typeof cities !== "object") return [];

  const out: ParsedCity[] = [];
  for (const [key, value] of Object.entries(cities as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const id = Number(v.ID ?? v.id ?? key);
    if (!Number.isFinite(id)) continue;
    const name = String(v.NAME ?? v.name ?? "").trim();
    if (!name) continue;
    const regionRaw = v.REF ?? v.ZONE ?? v.REGION ?? v.region ?? null;
    const region =
      regionRaw != null && String(regionRaw).trim() !== ""
        ? String(regionRaw).trim()
        : null;
    out.push({ id, name, region, raw: value });
  }
  return out;
}

/**
 * Load the OzonExpress city catalog (~793 cities) into the GLOBAL `CityCatalog`
 * table (no orgId, no RLS). Public endpoint — needs no credentials. Re-runnable:
 * the table is replaced atomically so a refresh picks up additions/renames.
 * Auth (admin+) is enforced by the calling server action.
 */
export async function refreshCityCatalog(): Promise<{ count: number }> {
  const res = await fetch(CITIES_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`OzonExpress /cities a répondu ${res.status}.`);
  }

  const cities = parseCities(await res.json());
  if (cities.length === 0) {
    throw new Error("Aucune ville reçue depuis OzonExpress.");
  }

  const data = cities.map((c) => ({
    id: c.id,
    name: c.name,
    region: c.region,
    raw: (c.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  }));

  // Replace the global catalog in one transaction (no FK references it).
  await db.$transaction([
    db.cityCatalog.deleteMany({}),
    db.cityCatalog.createMany({ data }),
  ]);

  return { count: cities.length };
}
