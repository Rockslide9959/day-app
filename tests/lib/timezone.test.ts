import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE_FALLBACK,
  isValidTimeZone,
  resolveTimeZone,
  zonedTimeToUtc,
  zonedTodayStr,
} from "@/lib/timezone";

describe("isValidTimeZone / resolveTimeZone", () => {
  it("accepts real IANA zone identifiers", () => {
    expect(isValidTimeZone("Africa/Johannesburg")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects invalid or empty identifiers", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it("resolveTimeZone passes through a valid zone unchanged", () => {
    expect(resolveTimeZone("Europe/London")).toBe("Europe/London");
  });

  it("resolveTimeZone falls back to Africa/Johannesburg for missing/invalid values", () => {
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIMEZONE_FALLBACK);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIMEZONE_FALLBACK);
    expect(resolveTimeZone("Bogus/Zone")).toBe(DEFAULT_TIMEZONE_FALLBACK);
  });
});

describe("zonedTimeToUtc", () => {
  it("converts Africa/Johannesburg (UTC+2, no DST) correctly", () => {
    const utc = zonedTimeToUtc("2026-08-15", "14:00", "Africa/Johannesburg");
    expect(utc.toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("converts an IANA zone with DST correctly in summer (EDT, UTC-4)", () => {
    const utc = zonedTimeToUtc("2026-08-15", "09:00", "America/New_York");
    expect(utc.toISOString()).toBe("2026-08-15T13:00:00.000Z");
  });

  it("converts the same zone correctly in winter (EST, UTC-5)", () => {
    const utc = zonedTimeToUtc("2026-01-15", "09:00", "America/New_York");
    expect(utc.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("handles a time near local midnight correctly", () => {
    const utc = zonedTimeToUtc("2026-08-15", "00:15", "Africa/Johannesburg");
    // 00:15 local (UTC+2) on the 15th is 22:15 UTC on the 14th.
    expect(utc.toISOString()).toBe("2026-08-14T22:15:00.000Z");
  });
});

describe("zonedTodayStr", () => {
  it("returns the local calendar date, which can differ from the UTC date", () => {
    const now = new Date("2026-08-15T22:30:00.000Z");
    // Johannesburg is UTC+2 — already past midnight locally.
    expect(zonedTodayStr("Africa/Johannesburg", now)).toBe("2026-08-16");
    // Los Angeles is UTC-7 in August (PDT) — still the 15th locally.
    expect(zonedTodayStr("America/Los_Angeles", now)).toBe("2026-08-15");
  });
});
