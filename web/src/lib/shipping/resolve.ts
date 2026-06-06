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
export type ResolveMethod =
  | "alias"
  | "exact"
  | "casa"
  | "fuzzy"
  | "approx"
  | "guess"
  | "none";

/** Levenshtein edit distance (iterative, two-row). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[n];
}

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
  /**
   * Always-on best-effort suggestion for pre-filling the picker. Tries the
   * confident `resolve` first; otherwise returns the CLOSEST match by edit
   * distance. For Casa-family villes it ranks the districts against the address
   * (since "Casablanca" alone is ambiguous). Method is `approx` (near) or
   * `guess` (far) so the UI can flag low-confidence picks.
   */
  closest(
    ville: string,
    address?: string
  ): { cityId: number | null; method: ResolveMethod };
  /** Best-effort id only (kept for compatibility). */
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

  /** Rank Casa districts by closeness to the address tokens. */
  function rankCasaByAddress(
    address: string
  ): { id: number; dist: number } | null {
    const toks = cityKey(address).split(" ").filter((t) => t.length > 2);
    if (toks.length === 0) return null;
    let best: { id: number; dist: number } | null = null;
    for (const c of casa) {
      const dToks = c.district.split(" ").filter(Boolean);
      let dist = Infinity;
      for (const dt of dToks) {
        for (const at of toks) {
          if (at.includes(dt) || dt.includes(at)) dist = Math.min(dist, 1);
          dist = Math.min(dist, levenshtein(dt, at));
        }
      }
      if (best == null || dist < best.dist) best = { id: c.id, dist };
    }
    return best;
  }

  /** Closest catalog city to `ville` by edit distance (+ substring bonus). */
  function closestCity(
    ville: string
  ): { id: number; dist: number } | null {
    const q = cityKey(ville);
    if (!q) return null;
    let best: { id: number; dist: number; len: number } | null = null;
    for (const c of cities) {
      const ck = cityKey(c.name);
      let d = levenshtein(q, ck);
      if (ck.includes(q) || q.includes(ck)) d = Math.min(d, 1);
      if (
        best == null ||
        d < best.dist ||
        (d === best.dist && c.name.length < best.len)
      ) {
        best = { id: c.id, dist: d, len: c.name.length };
      }
    }
    return best ? { id: best.id, dist: best.dist } : null;
  }

  function closest(ville: string, address = "") {
    const conf = resolve(ville, address);
    if (conf.cityId != null) return conf;

    const k = cityKey(ville);
    if (/casa/.test(k) || matchCasaDistrict(casa, ville) != null) {
      const r = rankCasaByAddress(address) ?? rankCasaByAddress(ville);
      if (r)
        return {
          cityId: r.id,
          method: (r.dist <= 2 ? "approx" : "guess") as ResolveMethod,
        };
      return { cityId: null, method: "none" as ResolveMethod };
    }

    const c = closestCity(ville);
    if (c)
      return {
        cityId: c.id,
        method: (c.dist <= 2 ? "approx" : "guess") as ResolveMethod,
      };
    return { cityId: null, method: "none" as ResolveMethod };
  }

  function suggest(ville: string, address = ""): number | null {
    return closest(ville, address).cityId;
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

  return { resolve, closest, suggest, cityName, search, cities };
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
