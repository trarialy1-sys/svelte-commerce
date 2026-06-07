import { describe, expect, it } from "vitest";

import { rank } from "../search";

describe("search rank (exact → prefix → contains → none)", () => {
  it("exact match wins", () => {
    expect(rank("RAB4236", ["RAB4236"])).toBe(0);
    expect(rank("rab4236", ["RAB4236"])).toBe(0); // case-insensitive
  });
  it("prefix beats contains", () => {
    expect(rank("0612", ["0612345678"])).toBe(1);
    expect(rank("345", ["0612345678"])).toBe(2);
  });
  it("no match → 3", () => {
    expect(rank("zzz", ["RAB4236", "Ahmed"])).toBe(3);
  });
  it("takes the best rank across fields", () => {
    // contains in one field, exact in another → exact wins
    expect(rank("ahmed", ["Commande X", "Ahmed"])).toBe(0);
    expect(rank("ah", ["Commande X", "Ahmed"])).toBe(1);
  });
  it("ignores null/undefined fields", () => {
    expect(rank("x", [null, undefined, "axb"])).toBe(2);
  });
});
