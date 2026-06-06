// Set a deterministic 32-byte key before the crypto module reads it (lazy).
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

describe("crypto vault (AES-256-GCM)", () => {
  it("round-trips a JSON payload", () => {
    const payload = JSON.stringify({
      shopDomain: "acme.myshopify.com",
      adminAccessToken: "shpat_secret_value",
      apiVersion: "2026-01",
    });
    const blob = encrypt(payload);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob.split(".")).toHaveLength(4);
    // The blob must not contain the plaintext secret.
    expect(blob).not.toContain("shpat_secret_value");
    expect(decrypt(blob)).toBe(payload);
  });

  it("produces a different IV/ciphertext each time", () => {
    const a = encrypt("same input");
    const b = encrypt("same input");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same input");
    expect(decrypt(b)).toBe("same input");
  });

  it("rejects a tampered ciphertext", () => {
    const blob = encrypt("sensitive");
    const [v, iv, tag, ct] = blob.split(".");
    // Flip a byte in the ciphertext.
    const buf = Buffer.from(ct, "base64");
    buf[0] = buf[0] ^ 0xff;
    const tampered = [v, iv, tag, buf.toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const blob = encrypt("sensitive");
    const [v, iv, tag, ct] = blob.split(".");
    const buf = Buffer.from(tag, "base64");
    buf[0] = buf[0] ^ 0xff;
    const tampered = [v, iv, buf.toString("base64"), ct].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a malformed blob", () => {
    expect(() => decrypt("not-a-valid-blob")).toThrow();
    expect(() => decrypt("v2.aaa.bbb.ccc")).toThrow();
  });
});
