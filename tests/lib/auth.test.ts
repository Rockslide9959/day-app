import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-value-not-used-in-prod";
});

describe("session tokens", () => {
  it("round-trips a valid session token back to the userId", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth");
    const token = createSessionToken("user-123");
    expect(verifySessionToken(token)).toBe("user-123");
  });

  it("rejects a tampered userId (signature no longer matches)", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth");
    const token = createSessionToken("user-123");
    const tampered = token.replace("user-123", "user-456");
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth");
    const token = createSessionToken("user-123");
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects a missing or malformed token", async () => {
    const { verifySessionToken } = await import("@/lib/auth");
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("no-dot-separator")).toBeNull();
  });

  it("never authenticates anything when AUTH_SECRET is unset", async () => {
    const original = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    const { verifySessionToken } = await import("@/lib/auth");
    expect(verifySessionToken("user-123.somesignature")).toBeNull();
    process.env.AUTH_SECRET = original;
  });
});
