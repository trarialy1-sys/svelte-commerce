import "server-only";

import { getOrgDb } from "@/lib/db";

/**
 * Find-or-create a Customer by (orgId, phone) from an order's contact info.
 * Fills name/city if missing; updates first/last order timestamps. Returns the
 * customer id to link onto the order. Counts/segments come in Chunk 2.1.
 */
export async function upsertCustomerFromOrder(
  orgId: string,
  contact: { name?: string; phone?: string; city?: string | null }
): Promise<string | null> {
  const phone = (contact.phone ?? "").trim();
  if (!phone) return null;

  const odb = getOrgDb(orgId);
  const now = new Date();
  const existing = await odb.customer.findUnique({
    where: { orgId_phone: { orgId, phone } },
    select: { id: true, name: true, city: true },
  });

  if (existing) {
    await odb.customer.update({
      where: { orgId_phone: { orgId, phone } },
      data: {
        name: existing.name || contact.name || "Client",
        city: existing.city || contact.city || null,
        lastOrderAt: now,
      },
    });
    return existing.id;
  }

  const created = await odb.customer.create({
    data: {
      orgId,
      phone,
      name: contact.name || "Client",
      city: contact.city || null,
      firstOrderAt: now,
      lastOrderAt: now,
    },
    select: { id: true },
  });
  return created.id;
}
