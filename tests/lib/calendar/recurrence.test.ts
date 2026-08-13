import { describe, expect, it } from "vitest";
import { expandEventOccurrences, expandOccurrenceDates } from "@/lib/calendar/recurrence";

describe("expandOccurrenceDates", () => {
  it("returns just the master date for non-recurring events in range", () => {
    expect(
      expandOccurrenceDates("2026-08-14", { recurrence: "none", recurrenceDays: null, recurrenceEndDate: null }, {
        from: "2026-08-01",
        to: "2026-08-31",
      })
    ).toEqual(["2026-08-14"]);
  });

  it("expands daily recurrence across the whole range", () => {
    const dates = expandOccurrenceDates(
      "2026-08-01",
      { recurrence: "daily", recurrenceDays: null, recurrenceEndDate: null },
      { from: "2026-08-01", to: "2026-08-05" }
    );
    expect(dates).toEqual(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("expands weekly recurrence on the master's own weekday (a Monday)", () => {
    // 2026-08-03 is a Monday
    const dates = expandOccurrenceDates(
      "2026-08-03",
      { recurrence: "weekly", recurrenceDays: null, recurrenceEndDate: null },
      { from: "2026-08-01", to: "2026-08-31" }
    );
    expect(dates).toEqual(["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]);
  });

  it("expands custom weekly days (gym Mon/Wed/Fri)", () => {
    const dates = expandOccurrenceDates(
      "2026-08-03", // Monday
      { recurrence: "custom", recurrenceDays: "1,3,5", recurrenceEndDate: null },
      { from: "2026-08-03", to: "2026-08-09" }
    );
    // Mon 3, Wed 5, Fri 7
    expect(dates).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
  });

  it("expands weekdays-only recurrence, skipping weekends", () => {
    const dates = expandOccurrenceDates(
      "2026-08-03", // Monday
      { recurrence: "weekdays", recurrenceDays: null, recurrenceEndDate: null },
      { from: "2026-08-03", to: "2026-08-09" } // through the following Sunday
    );
    expect(dates).toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
  });

  it("never returns occurrences before the master's own start date", () => {
    const dates = expandOccurrenceDates(
      "2026-08-15",
      { recurrence: "daily", recurrenceDays: null, recurrenceEndDate: null },
      { from: "2026-08-01", to: "2026-08-31" }
    );
    expect(dates[0]).toBe("2026-08-15");
  });

  it("respects an explicit recurrenceEndDate", () => {
    const dates = expandOccurrenceDates(
      "2026-08-01",
      { recurrence: "daily", recurrenceDays: null, recurrenceEndDate: "2026-08-03" },
      { from: "2026-08-01", to: "2026-08-31" }
    );
    expect(dates).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });
});

describe("expandEventOccurrences", () => {
  const base = {
    id: "evt-1",
    date: "2026-08-03",
    endDate: null,
    recurrence: "weekly",
    recurrenceDays: null,
    recurrenceEndDate: null,
    completedDates: "",
    completed: false,
  };

  it("marks each occurrence's completed state from completedDates", () => {
    const item = { ...base, completedDates: "2026-08-10" };
    const occurrences = expandEventOccurrences(item, { from: "2026-08-01", to: "2026-08-17" });
    const byDate = Object.fromEntries(occurrences.map((o) => [o.occurrenceDate, o.completed]));
    expect(byDate["2026-08-03"]).toBe(false);
    expect(byDate["2026-08-10"]).toBe(true);
    expect(byDate["2026-08-17"]).toBe(false);
  });

  it("gives each occurrence a distinct occurrenceId but keeps the real master id", () => {
    const occurrences = expandEventOccurrences(base, { from: "2026-08-01", to: "2026-08-17" });
    expect(occurrences.every((o) => o.id === "evt-1")).toBe(true);
    const ids = new Set(occurrences.map((o) => o.occurrenceId));
    expect(ids.size).toBe(occurrences.length);
  });

  it("preserves a multi-day span across each occurrence", () => {
    const item = { ...base, recurrence: "none", date: "2026-08-01", endDate: "2026-08-03" };
    const occurrences = expandEventOccurrences(item, { from: "2026-08-01", to: "2026-08-31" });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-08-01");
    expect(occurrences[0].endDate).toBe("2026-08-03");
  });

  it("returns nothing for a non-recurring event outside the range", () => {
    const item = { ...base, recurrence: "none", date: "2020-01-01", endDate: null };
    expect(expandEventOccurrences(item, { from: "2026-08-01", to: "2026-08-31" })).toHaveLength(0);
  });
});
