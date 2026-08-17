import { describe, expect, it } from "vitest";
import {
  isValidDateStr,
  isValidTimeStr,
  validateEntryType,
  validateJournalDate,
  validateNotebookContent,
  validateNotebookTags,
  validateNotebookTitle,
  validatePassword,
  validateUsername,
} from "@/lib/validation";

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

describe("isValidTimeStr", () => {
  it("accepts a normal 24-hour HH:MM", () => {
    expect(isValidTimeStr("20:00")).toBe(true);
    expect(isValidTimeStr("00:00")).toBe(true);
    expect(isValidTimeStr("23:59")).toBe(true);
  });

  it("rejects an out-of-range hour or minute", () => {
    expect(isValidTimeStr("24:00")).toBe(false);
    expect(isValidTimeStr("12:60")).toBe(false);
  });

  it("rejects 12-hour format and malformed strings", () => {
    expect(isValidTimeStr("8:00 PM")).toBe(false);
    expect(isValidTimeStr("20:0")).toBe(false);
    expect(isValidTimeStr("2000")).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(isValidTimeStr(undefined)).toBe(false);
  });
});

describe("validateEntryType", () => {
  it("accepts undefined (caller defaults to note)", () => {
    expect(validateEntryType(undefined)).toBeNull();
  });

  it("accepts note and journal", () => {
    expect(validateEntryType("note")).toBeNull();
    expect(validateEntryType("journal")).toBeNull();
  });

  it("rejects an unsupported entryType", () => {
    expect(validateEntryType("todo")).not.toBeNull();
  });
});

describe("isValidDateStr", () => {
  it("accepts a real local calendar date", () => {
    expect(isValidDateStr("2026-08-20")).toBe(true);
  });

  it("rejects a malformed string", () => {
    expect(isValidDateStr("08/20/2026")).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    expect(isValidDateStr("2026-02-30")).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(isValidDateStr(undefined)).toBe(false);
  });
});

describe("validateJournalDate", () => {
  it("requires a valid journalDate for a journal entry", () => {
    expect(validateJournalDate("journal", "2026-08-20")).toBeNull();
    expect(validateJournalDate("journal", undefined)).not.toBeNull();
    expect(validateJournalDate("journal", "not-a-date")).not.toBeNull();
  });

  it("rejects a journalDate set on a note", () => {
    expect(validateJournalDate("note", null)).toBeNull();
    expect(validateJournalDate("note", undefined)).toBeNull();
    expect(validateJournalDate("note", "2026-08-20")).not.toBeNull();
  });
});

describe("validateNotebookTitle", () => {
  it("rejects a blank title", () => {
    expect(validateNotebookTitle("")).not.toBeNull();
    expect(validateNotebookTitle("   ")).not.toBeNull();
  });

  it("accepts a normal title", () => {
    expect(validateNotebookTitle("First week back")).toBeNull();
  });

  it("rejects an excessively long title", () => {
    expect(validateNotebookTitle("x".repeat(500))).not.toBeNull();
  });
});

describe("validateNotebookTags / validateNotebookContent", () => {
  it("accepts undefined for both", () => {
    expect(validateNotebookTags(undefined)).toBeNull();
    expect(validateNotebookContent(undefined)).toBeNull();
  });

  it("rejects oversized tags and content", () => {
    expect(validateNotebookTags("x".repeat(1000))).not.toBeNull();
    expect(validateNotebookContent("x".repeat(1_000_000))).not.toBeNull();
  });

  it("allows long-form writing well under the cap", () => {
    expect(validateNotebookContent("x".repeat(50_000))).toBeNull();
  });
});
