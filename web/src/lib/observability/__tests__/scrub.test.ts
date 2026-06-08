import { describe, expect, it } from "vitest";
import type { Event } from "@sentry/nextjs";

import { redactString, scrubBreadcrumb, scrubEvent } from "../scrub";

describe("redactString", () => {
  it("strips emails and Moroccan phone numbers from free text", () => {
    expect(redactString("contact ali@example.com now")).not.toContain("ali@example.com");
    expect(redactString("call 0612345678 please")).not.toContain("0612345678");
    expect(redactString("call +212612345678")).toContain("[redacted]");
  });

  it("leaves non-PII text intact", () => {
    expect(redactString("order RAB4236 delivered")).toBe("order RAB4236 delivered");
  });
});

describe("scrubEvent", () => {
  it("redacts credentials, customer PII and COD figures from extra", () => {
    const event: Event = {
      extra: {
        apiKey: "a25c34-secret",
        customerId: "7123",
        phone: "0612345678",
        email: "buyer@example.com",
        address: "12 rue de Casablanca",
        customerName: "Ali B.",
        codPrice: 349.0,
        amount: 1200,
        nested: { adminAccessToken: "shpat_xxx", note: "all good" },
      },
    };
    const out = scrubEvent(event);
    const extra = out.extra as Record<string, unknown>;
    expect(extra.apiKey).toBe("[redacted]");
    expect(extra.customerId).toBe("[redacted]");
    expect(extra.phone).toBe("[redacted]");
    expect(extra.email).toBe("[redacted]");
    expect(extra.address).toBe("[redacted]");
    expect(extra.customerName).toBe("[redacted]");
    expect(extra.codPrice).toBe("[redacted]");
    expect(extra.amount).toBe("[redacted]");
    expect((extra.nested as Record<string, unknown>).adminAccessToken).toBe("[redacted]");
    // Non-sensitive nested data survives.
    expect((extra.nested as Record<string, unknown>).note).toBe("all good");
  });

  it("keeps only user.id and allow-listed context (orgId/userId tags)", () => {
    const event: Event = {
      user: { id: "user_123", email: "buyer@example.com", ip_address: "1.2.3.4" },
      tags: { orgId: "org_abc", userId: "user_123", phone: "0612345678" },
    };
    const out = scrubEvent(event);
    expect(out.user).toEqual({ id: "user_123" });
    const tags = out.tags as Record<string, unknown>;
    expect(tags.orgId).toBe("org_abc");
    expect(tags.userId).toBe("user_123");
    expect(tags.phone).toBe("[redacted]");
  });

  it("drops request headers/cookies and scrubs the body + url", () => {
    const event: Event = {
      request: {
        url: "https://app/orders?email=buyer@example.com",
        method: "POST",
        headers: { authorization: "Bearer xyz", cookie: "session=abc" },
        cookies: { session: "abc" },
        data: { phone: "0612345678", note: "ok" },
      },
    };
    const out = scrubEvent(event);
    expect(out.request?.headers).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.url).not.toContain("buyer@example.com");
    expect((out.request?.data as Record<string, unknown>).phone).toBe("[redacted]");
    expect((out.request?.data as Record<string, unknown>).note).toBe("ok");
    expect(out.request?.method).toBe("POST");
  });

  it("redacts PII from the exception message", () => {
    const event: Event = {
      exception: {
        values: [{ type: "Error", value: "failed for buyer@example.com (0612345678)" }],
      },
    };
    const out = scrubEvent(event);
    const v = out.exception?.values?.[0].value ?? "";
    expect(v).not.toContain("buyer@example.com");
    expect(v).not.toContain("0612345678");
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs sensitive breadcrumb data and message PII", () => {
    const out = scrubBreadcrumb({
      message: "fetch for ali@example.com",
      data: { url: "https://api/x?phone=0612345678", token: "abc" },
    });
    expect(out.message).not.toContain("ali@example.com");
    const data = out.data as Record<string, unknown>;
    expect(data.token).toBe("[redacted]");
    expect(String(data.url)).not.toContain("0612345678");
  });
});
