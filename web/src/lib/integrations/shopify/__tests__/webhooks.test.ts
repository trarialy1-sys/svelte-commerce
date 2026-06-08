import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyWebhookHmac, webhookCallbackUrl } from "../webhooks";

const secret = "shpss_webhook_secret";
const body = JSON.stringify({ id: 123, name: "#1001" });

function sign(raw: string): string {
  return crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
}

describe("verifyWebhookHmac", () => {
  it("accepts a correctly-signed raw body", () => {
    expect(verifyWebhookHmac(body, secret, sign(body))).toBe(true);
  });

  it("rejects a wrong, empty, or tampered HMAC", () => {
    expect(verifyWebhookHmac(body, secret, "nope")).toBe(false);
    expect(verifyWebhookHmac(body, secret, null)).toBe(false);
    expect(verifyWebhookHmac(body + " ", secret, sign(body))).toBe(false);
    expect(verifyWebhookHmac(body, "other-secret", sign(body))).toBe(false);
  });
});

describe("webhookCallbackUrl", () => {
  it("carries the orgId for routing", () => {
    expect(webhookCallbackUrl("org_42")).toMatch(
      /\/api\/webhooks\/shopify\?org=org_42$/
    );
  });
});
