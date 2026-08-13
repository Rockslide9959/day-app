import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/passwords";

describe("password hashing", () => {
  it("round-trips a correct password", () => {
    const hash = hashPassword("CorrectHorse42!");
    expect(verifyPassword("CorrectHorse42!", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("CorrectHorse42!");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the plaintext password in the hash", () => {
    const hash = hashPassword("CorrectHorse42!");
    expect(hash).not.toContain("CorrectHorse42!");
  });

  it("produces a different hash each time (random salt)", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
    expect(verifyPassword("same-password", b)).toBe(true);
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});
