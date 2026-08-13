import { describe, expect, it } from "vitest";
import { validatePassword, validateUsername } from "@/lib/validation";

describe("validateUsername", () => {
  it("accepts a normal username", () => {
    expect(validateUsername("testuser42")).toBeNull();
  });

  it("rejects too short", () => {
    expect(validateUsername("ab")).not.toBeNull();
  });

  it("rejects special characters that aren't _ . -", () => {
    expect(validateUsername("bad name!")).not.toBeNull();
  });

  it("rejects a non-string", () => {
    expect(validateUsername(undefined)).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("accepts a reasonable password", () => {
    expect(validatePassword("CorrectHorse42!")).toBeNull();
  });

  it("rejects passwords under 8 characters", () => {
    expect(validatePassword("short1")).not.toBeNull();
  });
});
