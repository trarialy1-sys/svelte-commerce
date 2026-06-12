import "server-only";

import { getOrgDb } from "@/lib/db";
import { getCityResolver } from "./resolve";
import { learnCityAlias } from "./learn";

/**
 * Resolution methods we trust enough to accept WITHOUT an operator confirmation
 * — the city name is either exact, a learned alias, a real Casa district, or a
 * token-subset (fuzzy) match. `approx` / `guess` / `none` still need a human pick.
 */
export const CONFIDENT_METHODS = new Set(["alias", "exact", "casa", "fuzzy"]);

/**
 * For each order missing a saved `cityId`, persist the confidently-detected city
 * (and learn the alias) so the parcel send has a numeric city without the team
 * having to confirm an already-correct name. Returns how many were resolved.
 *
 * Used just-in-time by the send paths so a correct city never blocks shipping.
 */
export async function persistConfidentCities(
  orgId: string,
  orderIds: string[],
  actorUserId?: string | null
): Promise<number> {
  const ids = orderIds.filter((id) => typeof id === "string" && id);
  if (ids.length === 0) return 0;

  const odb = getOrgDb(orgId);
  const resolver = await getCityResolver(orgId);
  const unresolved = await odb.order.findMany({
    where: { id: { in: ids }, cityId: null },
    select: { id: true, cityRaw: true, address: true },
  });

  let count = 0;
  for (const o of unresolved) {
    const r = resolver.closest(o.cityRaw ?? "", o.address ?? "");
    if (r.cityId != null && CONFIDENT_METHODS.has(r.method)) {
      await odb.order.update({ where: { id: o.id }, data: { cityId: r.cityId } });
      await learnCityAlias(orgId, o.cityRaw ?? "", r.cityId, actorUserId);
      count++;
    }
  }
  return count;
}
