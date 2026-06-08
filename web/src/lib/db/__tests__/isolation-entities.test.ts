import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, getOrgDb, withOrg } from "@/lib/db";

/**
 * Tenant-isolation, expanded beyond the 0.3 customer check (chunk 3.4): prove
 * org A can never read or write org B's rows across the entities reports +
 * finance + CRM actually touch — orders, order items, parcels, remittances.
 *
 * Runs against the test DB. In CI this executes as a NON-superuser Postgres role
 * (see .github/workflows/web-test.yml) so RLS is genuinely enforced — a
 * superuser/BYPASSRLS role would pass for the wrong reason.
 */
const ORG_A = "org_iso_A";
const ORG_B = "org_iso_B";

async function cleanup() {
  for (const org of [ORG_A, ORG_B]) {
    const odb = getOrgDb(org);
    await odb.orderItem.deleteMany({});
    await odb.parcel.deleteMany({});
    await odb.order.deleteMany({});
    await odb.remittance.deleteMany({});
    await odb.customer.deleteMany({});
  }
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

async function seedOrg(org: string, tag: string) {
  const odb = getOrgDb(org);
  const customer = await odb.customer.create({
    data: { name: `Cust ${tag}`, phone: `+21260000000${tag === "A" ? 1 : 2}` },
  });
  const order = await odb.order.create({
    data: {
      code: `CMD-${tag}-1`,
      customerId: customer.id,
      totalPrice: tag === "A" ? 100 : 200,
      items: { create: [{ orgId: org, sku: `SKU-${tag}`, qty: 1, unitPrice: 50 }] },
    },
  });
  await odb.parcel.create({
    data: { orderId: order.id, codPrice: tag === "A" ? 100 : 200, tracking: `TRK-${tag}` },
  });
  await odb.remittance.create({
    data: { amount: tag === "A" ? 100 : 200, date: new Date("2026-06-01") },
  });
}

beforeAll(async () => {
  await cleanup();
  await db.organization.createMany({
    data: [
      { id: ORG_A, name: "Iso A" },
      { id: ORG_B, name: "Iso B" },
    ],
  });
  await seedOrg(ORG_A, "A");
  await seedOrg(ORG_B, "B");
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("cross-org reads are scoped (orders / items / parcels / remittances)", () => {
  it("each org sees only its own rows", async () => {
    const a = getOrgDb(ORG_A);
    const b = getOrgDb(ORG_B);

    expect((await a.order.findMany()).every((r) => r.orgId === ORG_A)).toBe(true);
    expect((await b.order.findMany()).every((r) => r.orgId === ORG_B)).toBe(true);
    expect((await a.orderItem.findMany()).every((r) => r.orgId === ORG_A)).toBe(true);
    expect((await a.parcel.findMany()).every((r) => r.orgId === ORG_A)).toBe(true);
    expect((await a.remittance.findMany()).every((r) => r.orgId === ORG_A)).toBe(true);
  });

  it("an explicit cross-org filter cannot escape the scope", async () => {
    const rows = await getOrgDb(ORG_A).order.findMany({ where: { orgId: ORG_B } });
    expect(rows.some((r) => r.orgId === ORG_B)).toBe(false);
  });

  it("finance + reports aggregates never mix orgs", async () => {
    // Sum of delivered/created COD must reflect only the active org.
    const aCod = await getOrgDb(ORG_A).parcel.aggregate({ _sum: { codPrice: true } });
    const bCod = await getOrgDb(ORG_B).parcel.aggregate({ _sum: { codPrice: true } });
    expect(Number(aCod._sum.codPrice ?? 0)).toBe(100);
    expect(Number(bCod._sum.codPrice ?? 0)).toBe(200);

    const aRem = await getOrgDb(ORG_A).remittance.aggregate({ _sum: { amount: true } });
    expect(Number(aRem._sum.amount ?? 0)).toBe(100);
  });
});

describe("cross-org writes cannot touch the other org's rows", () => {
  it("updateMany aimed at B's own row id affects nothing from A's client", async () => {
    // Target B's actual order by id. The injected orgId=A is merged last, so the
    // effective filter is {id: bOrder.id, orgId: A} — which matches no row.
    const bOrder = await getOrgDb(ORG_B).order.findFirstOrThrow();
    const res = await getOrgDb(ORG_A).order.updateMany({
      where: { id: bOrder.id },
      data: { status: "ANNULEE" },
    });
    expect(res.count).toBe(0);
    // B's order is untouched.
    const after = await getOrgDb(ORG_B).order.findUniqueOrThrow({ where: { id: bOrder.id } });
    expect(after.status).not.toBe("ANNULEE");
  });

  it("deleteMany aimed at B's own row id deletes nothing from A's client", async () => {
    const bRem = await getOrgDb(ORG_B).remittance.findFirstOrThrow();
    const res = await getOrgDb(ORG_A).remittance.deleteMany({ where: { id: bRem.id } });
    expect(res.count).toBe(0);
    expect(await getOrgDb(ORG_B).remittance.count()).toBe(1);
  });
});

describe("RLS net (raw queries)", () => {
  it("with the org GUC set, raw queries see only that org's orders", async () => {
    const rows = await withOrg(ORG_A, (tx) =>
      tx.$queryRaw<Array<{ orgId: string }>>`SELECT "orgId" FROM "Order"`
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.orgId === ORG_A)).toBe(true);
  });

  it("with NO GUC set, tenant tables return zero rows", async () => {
    const rows = await db.$queryRaw<Array<{ orgId: string }>>`SELECT "orgId" FROM "Order"`;
    expect(rows).toHaveLength(0);
  });
});
