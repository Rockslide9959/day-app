import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

describe("crypto (token encryption)", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips a token through encrypt/decrypt", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto");
    const plaintext = "ya29.some-fake-google-access-token";
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptToken } = await import("@/lib/crypto");
    const a = encryptToken("same-input");
    const b = encryptToken("same-input");
    expect(a).not.toBe(b);
  });

  it("throws rather than silently returning garbage when the key is missing", async () => {
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const { encryptToken } = await import("@/lib/crypto");
    expect(() => encryptToken("x")).toThrow();
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });
});
