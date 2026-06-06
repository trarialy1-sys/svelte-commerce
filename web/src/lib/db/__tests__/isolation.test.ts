import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, getOrgDb, withOrg } from "@/lib/db";

// Two isolated tenants.
const ORG_A = "org_test_A";
const ORG_B = "org_test_B";

async function cleanup() {
  // Customers are RLS-protected; delete them per-org via the scoped client.
  await getOrgDb(ORG_A).customer.deleteMany({});
  await getOrgDb(ORG_B).customer.deleteMany({});
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

beforeAll(async () => {
  await cleanup();
  // Organization is a non-tenant table → base db.
  await db.organization.createMany({
    data: [
      { id: ORG_A, name: "Org A" },
      { id: ORG_B, name: "Org B" },
    ],
  });
  // One customer per org via the org-scoped client (orgId auto-injected).
  await getOrgDb(ORG_A).customer.create({
    data: { name: "Alice", phone: "+212600000001" },
  });
  await getOrgDb(ORG_B).customer.create({
    data: { name: "Bob", phone: "+212600000002" },
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("org-scoped data layer (app-layer guard)", () => {
  it("returns only the active org's rows", async () => {
    const aRows = await getOrgDb(ORG_A).customer.findMany();
    const bRows = await getOrgDb(ORG_B).customer.findMany();

    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.name).toBe("Alice");
    expect(aRows.every((r) => r.orgId === ORG_A)).toBe(true);

    expect(bRows).toHaveLength(1);
    expect(bRows[0]?.name).toBe("Bob");
    expect(bRows.every((r) => r.orgId === ORG_B)).toBe(true);
  });

  it("org A cannot read org B even with an explicit cross-org filter", async () => {
    // Try to escape the scope by asking for B's org from A's client.
    const rows = await getOrgDb(ORG_A).customer.findMany({
      where: { orgId: ORG_B },
    });
    // The injected orgId=A is merged last and overrides the spoofed filter,
    // so A only ever sees its own rows — never B's.
    expect(rows.every((r) => r.orgId === ORG_A)).toBe(true);
    expect(rows.some((r) => r.orgId === ORG_B)).toBe(false);
  });
});

describe("Row-Level Security (database net)", () => {
  it("with the org GUC set, a raw query sees only that org", async () => {
    const rows = await withOrg(ORG_A, (tx) =>
      tx.$queryRaw<Array<{ orgId: string }>>`SELECT "orgId" FROM "Customer"`
    );
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.orgId === ORG_A)).toBe(true);
  });

  it("with NO GUC set, tenant tables return zero rows", async () => {
    // Raw query on the base connection, no app.current_org_id → RLS blocks all.
    const rows = await db.$queryRaw<
      Array<{ orgId: string }>
    >`SELECT "orgId" FROM "Customer"`;
    expect(rows).toHaveLength(0);
  });
});
