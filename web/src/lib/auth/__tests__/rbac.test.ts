import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { meetsOrgRole, type AppRole } from "@/lib/auth/roles";
import { canSee, NAV } from "@/config/nav";
import { db, getOrgDb } from "@/lib/db";
import { getDashboardSummary } from "@/lib/dashboard/summary";

/**
 * RBAC / money-gating, tested at the payload/endpoint level (not the UI).
 * The role matrix is pure; the dashboard-payload gating hits the test DB.
 */

const ROLES: AppRole[] = ["viewer", "operator", "admin", "owner"];

describe("meetsOrgRole (server-side role gate)", () => {
  it("respects the owner > admin > operator > viewer ordering", () => {
    expect(meetsOrgRole("operator", "admin")).toBe(false);
    expect(meetsOrgRole("viewer", "operator")).toBe(false);
    expect(meetsOrgRole("admin", "admin")).toBe(true);
    expect(meetsOrgRole("owner", "admin")).toBe(true);
    expect(meetsOrgRole(null, "viewer")).toBe(false);
  });

  it("only admin+ clears the finance/reports bar", () => {
    expect(ROLES.filter((r) => meetsOrgRole(r, "admin"))).toEqual(["admin", "owner"]);
  });
});

describe("nav visibility (canSee)", () => {
  const find = (href: string) =>
    NAV.flatMap((s) => s.items).find((i) => i.href === href)!;

  it("hides Finance + Reports from operators/viewers", () => {
    for (const href of ["/finance", "/reports"]) {
      const item = find(href);
      expect(canSee(item, "operator", false)).toBe(false);
      expect(canSee(item, "viewer", false)).toBe(false);
      expect(canSee(item, "admin", false)).toBe(true);
      expect(canSee(item, "owner", false)).toBe(true);
    }
  });

  it("shows Admin only to platform super-admins", () => {
    const admin = find("/admin");
    expect(canSee(admin, "owner", false)).toBe(false);
    expect(canSee(admin, "owner", true)).toBe(true);
  });
});

describe("dashboard payload money-gating (DB)", () => {
  const ORG = "org_rbac_1";

  beforeAll(async () => {
    await db.organization.deleteMany({ where: { id: ORG } });
    await db.organization.create({ data: { id: ORG, name: "RBAC Org" } });
    // A delivered parcel so the finance block has a non-trivial value.
    const order = await getOrgDb(ORG).order.create({
      data: { code: "RBAC-1", totalPrice: 100 },
    });
    await getOrgDb(ORG).parcel.create({
      data: { orderId: order.id, codPrice: 100, status: "LIVRE" },
    });
  });

  afterAll(async () => {
    const odb = getOrgDb(ORG);
    await odb.parcel.deleteMany({});
    await odb.order.deleteMany({});
    await db.organization.deleteMany({ where: { id: ORG } });
    await db.$disconnect();
  });

  it("omits the finance block for operator and viewer", async () => {
    for (const role of ["operator", "viewer"] as AppRole[]) {
      const summary = await getDashboardSummary(ORG, role);
      expect(summary.finance).toBeUndefined();
    }
  });

  it("includes the finance block for admin and owner", async () => {
    for (const role of ["admin", "owner"] as AppRole[]) {
      const summary = await getDashboardSummary(ORG, role);
      expect(summary.finance).toBeDefined();
      expect(summary.finance?.livreAEncaisser).toBe(100);
    }
  });
});
