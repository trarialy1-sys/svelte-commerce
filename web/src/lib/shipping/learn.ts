import "server-only";

import { getOrgDb } from "@/lib/db";
import { cityKey } from "./resolve";

/**
 * Learn a per-org city alias from an operator's pick — a faithful port of the
 * tool's `confirmCorrection` behavior: store `cityKey(ville) -> cityId`, but
 * NEVER alias casa/casablanca (the Casa district depends on the address, not the
 * ville name, so caching it would be wrong). Idempotent + audited.
 */
export async function learnCityAlias(
  orgId: string,
  cityRaw: string,
  cityId: number,
  actorUserId?: string | null
): Promise<void> {
  const k = cityKey(cityRaw);
  if (!k || k === "casablanca" || k === "casa") return;

  const odb = getOrgDb(orgId);
  await odb.cityAlias.upsert({
    where: { orgId_rawName: { orgId, rawName: k } },
    create: { orgId, rawName: k, ozonCityId: cityId },
    update: { ozonCityId: cityId },
  });
  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId: actorUserId ?? null,
      action: "shipping.alias_learned",
      entity: "CityAlias",
      entityId: k,
      meta: { cityId },
    },
  });
}
