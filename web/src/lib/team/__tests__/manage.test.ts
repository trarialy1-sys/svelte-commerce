import { describe, expect, it } from "vitest";

import {
  appRoleToClerk,
  assignableRoles,
  checkInvite,
  checkRemove,
  checkRoleChange,
  clerkRoleToApp,
} from "../manage";

describe("role mapping", () => {
  it("maps owner/admin -> org:admin, operator/viewer -> org:member", () => {
    expect(appRoleToClerk("owner")).toBe("org:admin");
    expect(appRoleToClerk("admin")).toBe("org:admin");
    expect(appRoleToClerk("operator")).toBe("org:member");
    expect(appRoleToClerk("viewer")).toBe("org:member");
  });
  it("reverse-maps coarse roles", () => {
    expect(clerkRoleToApp("org:admin")).toBe("admin");
    expect(clerkRoleToApp("org:member")).toBe("operator");
  });
});

describe("assignableRoles", () => {
  it("owner can assign anything incl. owner", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("owner")).toContain("admin");
  });
  it("admin can only assign operator/viewer", () => {
    expect(assignableRoles("admin").sort()).toEqual(["operator", "viewer"]);
  });
  it("operator/viewer can assign nothing", () => {
    expect(assignableRoles("operator")).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });
});

describe("checkInvite", () => {
  it("blocks operator from inviting", () => {
    expect(checkInvite("operator", "viewer").ok).toBe(false);
  });
  it("blocks admin from inviting an owner or admin", () => {
    expect(checkInvite("admin", "owner").ok).toBe(false);
    expect(checkInvite("admin", "admin").ok).toBe(false);
  });
  it("allows admin to invite operator/viewer", () => {
    expect(checkInvite("admin", "operator").ok).toBe(true);
    expect(checkInvite("admin", "viewer").ok).toBe(true);
  });
  it("allows owner to invite owner", () => {
    expect(checkInvite("owner", "owner").ok).toBe(true);
  });
});

describe("checkRoleChange", () => {
  const base = { ownerCount: 2 };
  it("admin cannot grant admin", () => {
    expect(
      checkRoleChange({ ...base, callerRole: "admin", targetCurrentRole: "operator", newRole: "admin" }).ok
    ).toBe(false);
  });
  it("admin cannot touch another admin", () => {
    expect(
      checkRoleChange({ ...base, callerRole: "admin", targetCurrentRole: "admin", newRole: "operator" }).ok
    ).toBe(false);
  });
  it("admin can flip operator <-> viewer", () => {
    expect(
      checkRoleChange({ ...base, callerRole: "admin", targetCurrentRole: "operator", newRole: "viewer" }).ok
    ).toBe(true);
  });
  it("only owner can grant owner", () => {
    expect(
      checkRoleChange({ ...base, callerRole: "admin", targetCurrentRole: "operator", newRole: "owner" }).ok
    ).toBe(false);
    expect(
      checkRoleChange({ ...base, callerRole: "owner", targetCurrentRole: "admin", newRole: "owner" }).ok
    ).toBe(true);
  });
  it("never demotes the last owner", () => {
    expect(
      checkRoleChange({ callerRole: "owner", targetCurrentRole: "owner", newRole: "admin", ownerCount: 1 }).ok
    ).toBe(false);
    expect(
      checkRoleChange({ callerRole: "owner", targetCurrentRole: "owner", newRole: "admin", ownerCount: 2 }).ok
    ).toBe(true);
  });
  it("rejects a no-op change", () => {
    expect(
      checkRoleChange({ ...base, callerRole: "owner", targetCurrentRole: "admin", newRole: "admin" }).ok
    ).toBe(false);
  });
});

describe("checkRemove", () => {
  it("never removes the last owner", () => {
    expect(checkRemove({ callerRole: "owner", targetRole: "owner", ownerCount: 1 }).ok).toBe(false);
    expect(checkRemove({ callerRole: "owner", targetRole: "owner", ownerCount: 2 }).ok).toBe(true);
  });
  it("admin cannot remove an owner or admin", () => {
    expect(checkRemove({ callerRole: "admin", targetRole: "owner", ownerCount: 2 }).ok).toBe(false);
    expect(checkRemove({ callerRole: "admin", targetRole: "admin", ownerCount: 2 }).ok).toBe(false);
  });
  it("admin can remove operator/viewer", () => {
    expect(checkRemove({ callerRole: "admin", targetRole: "operator", ownerCount: 1 }).ok).toBe(true);
  });
  it("operator cannot remove anyone", () => {
    expect(checkRemove({ callerRole: "operator", targetRole: "viewer", ownerCount: 1 }).ok).toBe(false);
  });
});
