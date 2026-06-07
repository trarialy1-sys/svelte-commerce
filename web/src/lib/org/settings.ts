import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";

export interface OrgSettings {
  id: string;
  name: string;
  logoUrl: string | null;
  locale: string;
  timezone: string;
  currency: string;
  brandColor: string;
}

const DEFAULTS = {
  locale: "fr",
  timezone: "Africa/Casablanca",
  currency: "MAD",
  brandColor: "#C1542D",
};

/**
 * Org profile/branding settings. Organization is a global (non-RLS) table, so
 * the base client is correct here. Memoized per request.
 */
export const getOrgSettings = cache(
  async (orgId: string): Promise<OrgSettings> => {
    const o = await db.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        locale: true,
        timezone: true,
        currency: true,
        brandColor: true,
      },
    });
    if (!o) {
      return { id: orgId, name: orgId, logoUrl: null, ...DEFAULTS };
    }
    return o;
  }
);
