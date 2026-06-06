import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, getOrgDb } from "@/lib/db";
import { CustomerSegment } from "@/generated/prisma/client";
import { customersConfig } from "@/modules/customers/config";
import { exportRows, listModule, parseListParams } from "@/lib/module/query";
import { MODULE_REGISTRY } from "@/lib/module/registry";

const ORG_A = "org_mod_A";
const ORG_B = "org_mod_B";

function params(overrides: Record<string, string>) {
  return parseListParams(new URLSearchParams(overrides), customersConfig);
}

function markVip() {
  const handler = MODULE_REGISTRY.customers.bulkHandlers?.mark_vip;
  if (!handler) throw new Error("mark_vip handler missing");
  return handler;
}

async function cleanup() {
  await getOrgDb(ORG_A).customer.deleteMany({});
  await getOrgDb(ORG_B).customer.deleteMany({});
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

beforeAll(async () => {
  await cleanup();
  await db.organization.createMany({
    data: [
      { id: ORG_A, name: "Mod A" },
      { id: ORG_B, name: "Mod B" },
    ],
  });

  for (let i = 0; i < 30; i++) {
    await getOrgDb(ORG_A).customer.create({
      data: {
        name: `Cust A${i}`,
        phone: `a${i}`,
        city: i % 2 ? "Casablanca" : "Rabat",
        segment:
          i % 3 === 0
            ? CustomerSegment.VIP
            : i % 3 === 1
              ? CustomerSegment.RECURRENT
              : CustomerSegment.NOUVEAU,
        ordersCount: i,
        totalSpent: i * 10,
        createdAt: new Date(2025, 0, 1 + i),
      },
    });
  }
  for (let i = 0; i < 5; i++) {
    await getOrgDb(ORG_B).customer.create({
      data: {
        name: `Cust B${i}`,
        phone: `b${i}`,
        city: "Fès",
        segment: CustomerSegment.NOUVEAU,
      },
    });
  }
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("module framework — list/filter/sort/paginate (server-side)", () => {
  it("paginates and scopes to the org", async () => {
    const res = await listModule(
      ORG_A,
      customersConfig,
      params({ pageSize: "10", page: "1" })
    );
    expect(res.total).toBe(30);
    expect(res.rows).toHaveLength(10);
    expect(res.rows.every((r) => r.orgId === ORG_A)).toBe(true);
  });

  it("filters by segment", async () => {
    const res = await listModule(
      ORG_A,
      customersConfig,
      params({ segment: "VIP", pageSize: "100" })
    );
    expect(res.total).toBeGreaterThan(0);
    expect(res.rows.every((r) => r.segment === "VIP")).toBe(true);
  });

  it("searches name/phone/city (case-insensitive)", async () => {
    const res = await listModule(
      ORG_A,
      customersConfig,
      params({ q: "casablanca", pageSize: "100" })
    );
    expect(res.total).toBeGreaterThan(0);
    expect(
      res.rows.every((r) => String(r.city).toLowerCase() === "casablanca")
    ).toBe(true);
  });

  it("sorts by ordersCount ascending", async () => {
    const res = await listModule(
      ORG_A,
      customersConfig,
      params({ sort: "ordersCount:asc", pageSize: "100" })
    );
    const counts = res.rows.map((r) => Number(r.ordersCount));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it("applies a date range filter (gte/lte, inclusive)", async () => {
    const res = await listModule(
      ORG_A,
      customersConfig,
      params({
        createdAt_from: "2025-01-01",
        createdAt_to: "2025-01-10",
        pageSize: "100",
      })
    );
    expect(res.total).toBe(10);
  });

  it("org A never sees org B rows", async () => {
    const res = await listModule(
      ORG_A,
      customersConfig,
      params({ pageSize: "100" })
    );
    expect(res.rows.some((r) => String(r.name).startsWith("Cust B"))).toBe(false);
  });
});

describe("export respects filters + org scope", () => {
  it("exports only VIP rows for org A", async () => {
    const rows = await exportRows(
      ORG_A,
      customersConfig,
      params({ segment: "VIP", pageSize: "100" })
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.segment === "VIP" && r.orgId === ORG_A)).toBe(
      true
    );
  });
});

describe("bulk handler mark_vip — scoped + effective", () => {
  it("marks selected customers VIP within the org", async () => {
    const some = await getOrgDb(ORG_A).customer.findMany({
      where: { segment: CustomerSegment.NOUVEAU },
      take: 3,
    });
    const ids = some.map((r) => r.id);
    const { updated } = await markVip()(ORG_A, ids);
    expect(updated).toBe(ids.length);
    const after = await getOrgDb(ORG_A).customer.findMany({
      where: { id: { in: ids } },
    });
    expect(after.every((r) => r.segment === "VIP")).toBe(true);
  });

  it("cannot touch another org's rows", async () => {
    const bRows = await getOrgDb(ORG_B).customer.findMany({});
    const bIds = bRows.map((r) => r.id);
    const { updated } = await markVip()(ORG_A, bIds);
    expect(updated).toBe(0);
    const bAfter = await getOrgDb(ORG_B).customer.findMany({});
    expect(bAfter.every((r) => r.segment === "NOUVEAU")).toBe(true);
  });
});
