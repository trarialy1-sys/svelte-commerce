import "server-only";

import { db, getOrgDb } from "@/lib/db";

/**
 * City-resolution engine — a faithful port of the proven logic in
 * `odes-tool.html` (cityKey / matchCasaDistrict / fuzzyCity / resolveCity /
 * suggestCity). The pure helpers are exported for unit tests; `getCityResolver`
 * wires them to the DB (global CityCatalog + per-org CityAlias).
 *
 * Quirks preserved exactly:
 *  - resolution order: alias -> exact -> Casa-district substring -> fuzzy.
 *  - `matchCasaDistrict(ville)` runs unconditionally (a ville that *is* a Casa
 *    district name resolves to that district).
 *  - the address is only consulted for Casa-family villes (`/casa/`) - never for
 *    non-Casa (the fix that stopped neighbourhoods becoming cities).
 *  - `fuzzyCity` needs >=2 tokens, every token must be a substring of the city
 *    name, shortest name wins.
 */

/** Normalize for matching: strip diacritics, lowercase, non-alnum -> spaces. */
export function cityKey(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface CityRow {
  id: number;
  name: string;
}
export interface CasaDistrict {
  id: number;
  district: string;
}
export type ResolveMethod = "alias" | "exact" | "casa" | "fuzzy" | "none";

/** Casa districts, longest-district-first (matches the tool's sort). */
export function buildCasa(cities: CityRow[]): CasaDistrict[] {
  return cities
    .filter((c) => /^casa/i.test(c.name))
    .map((c) => ({
      id: c.id,
      district: cityKey(c.name.replace(/^casa(blanca)?\s*[–—-]?\s*/i, "")),
    }))
    .filter((c) => c.district)
    .sort((a, b) => b.district.length - a.district.length);
}

export function matchCasaDistrict(
  casa: CasaDistrict[],
  text: string
): number | null {
  const t = cityKey(text);
  if (!t) return null;
  for (const c of casa) {
    if (c.district && t.includes(c.district)) return c.id;
  }
  return null;
}

export function fuzzyCity(cities: CityRow[], name: string): number | null {
  const t = cityKey(name);
  if (!t) return null;
  const toks = t.split(" ").filter(Boolean);
  if (toks.length < 2) return null;
  let best: CityRow | null = null;
  for (const c of cities) {
    const ck = cityKey(c.name);
    if (toks.every((w) => ck.includes(w))) {
      if (!best || c.name.length < best.name.length) best = c;
    }
  }
  return best ? best.id : null;
}

export interface CityResolver {
  resolve(
    ville: string,
    address?: string
  ): { cityId: number | null; method: ResolveMethod };
  /** Best-effort id for pre-filling the picker (resolve + Casa on ville+address). */
  suggest(ville: string, address?: string): number | null;
  cityName(id: number | null | undefined): string;
  search(q: string, limit?: number): CityRow[];
  cities: CityRow[];
}

/** Build a resolver from a city list + the org's learned aliases (cityKey -> id). */
export function makeResolver(
  cities: CityRow[],
  aliasMap: Map<string, number>
): CityResolver {
  const idx = new Map<string, number>();
  for (const c of cities) idx.set(cityKey(c.name), c.id);
  const casa = buildCasa(cities);
  const byId = new Map<number, string>();
  for (const c of cities) byId.set(c.id, c.name);

  function resolve(ville: string, address = "") {
    const k = cityKey(ville);
    if (aliasMap.has(k)) return { cityId: aliasMap.get(k)!, method: "alias" as const };
    if (idx.has(k)) return { cityId: idx.get(k)!, method: "exact" as const };
    let id = matchCasaDistrict(casa, ville);
    if (id != null) return { cityId: id, method: "casa" as const };
    if (/casa/.test(k)) {
      id = matchCasaDistrict(casa, address);
      if (id != null) return { cityId: id, method: "casa" as const };
    }
    const f = fuzzyCity(cities, ville);
    if (f != null) return { cityId: f, method: "fuzzy" as const };
    return { cityId: null, method: "none" as const };
  }

  function suggest(ville: string, address = ""): number | null {
    const r = resolve(ville, address);
    if (r.cityId != null) return r.cityId;
    return matchCasaDistrict(casa, `${ville || ""} ${address || ""}`);
  }

  function cityName(id: number | null | undefined): string {
    return id == null ? "" : byId.get(Number(id)) ?? "";
  }

  function search(q: string, limit = 15): CityRow[] {
    const key = cityKey(q);
    const qid = q.trim();
    const out: CityRow[] = [];
    for (const c of cities) {
      if (cityKey(c.name).includes(key) || String(c.id) === qid) {
        out.push(c);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  return { resolve, suggest, cityName, search, cities };
}

/** Load the global catalog + the org's aliases and build a resolver. */
export async function getCityResolver(orgId: string): Promise<CityResolver> {
  const cities = (await db.cityCatalog.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })) as CityRow[];
  const aliases = await getOrgDb(orgId).cityAlias.findMany({
    select: { rawName: true, ozonCityId: true },
  });
  const aliasMap = new Map<string, number>();
  for (const a of aliases) aliasMap.set(a.rawName, a.ozonCityId);
  return makeResolver(cities, aliasMap);
}
