import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  // 32-byte base64 key for state signing.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

import {
  buildAuthorizeUrl,
  isValidShopDomain,
  OAUTH_SCOPES,
  signState,
  verifyShopifyHmac,
  verifyState,
} from "../oauth";

describe("isValidShopDomain", () => {
  it("accepts a real myshopify domain", () => {
    expect(isValidShopDomain("odesma.myshopify.com")).toBe(true);
  });
  it("rejects non-myshopify / injection hosts", () => {
    expect(isValidShopDomain("evil.com")).toBe(false);
    expect(isValidShopDomain("odesma.myshopify.com.evil.com")).toBe(false);
    expect(isValidShopDomain("")).toBe(false);
  });
});

describe("signState / verifyState", () => {
  it("round-trips orgId + shop", () => {
    const token = signState("org_123", "odesma.myshopify.com");
    expect(verifyState(token)).toEqual({
      orgId: "org_123",
      shop: "odesma.myshopify.com",
    });
  });

  it("rejects a tampered payload", () => {
    const token = signState("org_123", "odesma.myshopify.com");
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ orgId: "org_evil", shop: "x.myshopify.com", nonce: "a", ts: Date.now() })
    ).toString("base64url");
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState(`${body}.deadbeef`)).toBeNull();
    expect(verifyState(null)).toBeNull();
  });
});

describe("verifyShopifyHmac", () => {
  const secret = "shpss_test_secret";
  function sign(params: Record<string, string>): string {
    const msg = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return crypto.createHmac("sha256", secret).update(msg).digest("hex");
  }

  it("accepts a correctly-signed query", () => {
    const base = { code: "abc", shop: "odesma.myshopify.com", state: "s", timestamp: "123" };
    const hmac = sign(base);
    expect(verifyShopifyHmac({ ...base, hmac }, secret)).toBe(true);
  });

  it("rejects a wrong/absent hmac", () => {
    const base = { code: "abc", shop: "odesma.myshopify.com" };
    expect(verifyShopifyHmac({ ...base, hmac: "00" }, secret)).toBe(false);
    expect(verifyShopifyHmac(base, secret)).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  it("targets the shop and carries scopes + state", () => {
    const url = buildAuthorizeUrl("odesma.myshopify.com", "cid", "st8");
    expect(url).toContain("https://odesma.myshopify.com/admin/oauth/authorize?");
    expect(url).toContain(`client_id=cid`);
    expect(url).toContain(encodeURIComponent(OAUTH_SCOPES));
    expect(url).toContain("state=st8");
    expect(url).toContain("redirect_uri=");
  });
});
