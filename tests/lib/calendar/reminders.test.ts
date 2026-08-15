import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLDAY_TIME,
  candidateOccurrenceDates,
  computeReminderInstant,
  isOccurrenceCompleted,
  occurrenceDueTime,
  reminderNotificationPayload,
  ReminderableItem,
} from "@/lib/calendar/reminders";

function baseItem(overrides: Partial<ReminderableItem> = {}): ReminderableItem {
  return {
    id: "item-1",
    itemType: "event",
    title: "Lecture",
    date: "2026-08-15",
    startTime: "14:00",
    allDay: false,
    reminderMinutesBefore: 30,
    completed: false,
    completedDates: "",
    recurrence: "none",
    recurrenceDays: null,
    recurrenceEndDate: null,
    ...overrides,
  };
}

describe("occurrenceDueTime", () => {
  it("uses startTime when a specific time is set", () => {
    expect(occurrenceDueTime({ allDay: false, startTime: "14:00" })).toBe("14:00");
  });

  it("defaults to 09:00 for an all-day event or a date-only task", () => {
    expect(occurrenceDueTime({ allDay: true, startTime: "00:00" })).toBe(DEFAULT_ALLDAY_TIME);
  });
});

describe("computeReminderInstant", () => {
  it("a non-recurring event fires at the correct offset before its start", () => {
    // 15 August 14:00 local, 30 min before -> 15 August 13:30 local (11:30 UTC, Johannesburg = UTC+2)
    const instant = computeReminderInstant(baseItem(), "2026-08-15", "Africa/Johannesburg");
    expect(instant.toISOString()).toBe("2026-08-15T11:30:00.000Z");
  });

  it("a zero-minute reminder fires exactly at start/due time", () => {
    const instant = computeReminderInstant(
      baseItem({ reminderMinutesBefore: 0 }),
      "2026-08-15",
      "Africa/Johannesburg"
    );
    expect(instant.toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("a date-only task uses the documented 9AM local default", () => {
    const instant = computeReminderInstant(
      baseItem({ itemType: "task", allDay: true, startTime: "00:00", reminderMinutesBefore: 0 }),
      "2026-08-15",
      "Africa/Johannesburg"
    );
    expect(instant.toISOString()).toBe("2026-08-15T07:00:00.000Z"); // 09:00 local = 07:00 UTC
  });

  it("a 1-day-before reminder on a date-only task lands on the previous day at 9AM", () => {
    const instant = computeReminderInstant(
      baseItem({ itemType: "task", allDay: true, startTime: "00:00", reminderMinutesBefore: 1440 }),
      "2026-08-15",
      "Africa/Johannesburg"
    );
    expect(instant.toISOString()).toBe("2026-08-14T07:00:00.000Z"); // 14 August 09:00 local
  });

  it("an offset that crosses midnight lands on the previous local day", () => {
    const instant = computeReminderInstant(
      baseItem({ startTime: "00:20", reminderMinutesBefore: 30 }),
      "2026-08-15",
      "Africa/Johannesburg"
    );
    // 00:20 local on the 15th minus 30 min = 23:50 local on the 14th (21:50 UTC)
    expect(instant.toISOString()).toBe("2026-08-14T21:50:00.000Z");
  });
});

describe("reminderNotificationPayload", () => {
  it("an event uses 'starts' wording with the event title prominent", () => {
    const payload = reminderNotificationPayload(baseItem({ title: "Lecture", reminderMinutesBefore: 30 }), "2026-08-15");
    expect(payload.title).toBe("Upcoming event");
    expect(payload.body).toBe("Lecture starts in 30 minutes");
    expect(payload.url).toBe("/calendar?date=2026-08-15");
  });

  it("a task uses 'due' wording, never 'starting'", () => {
    const payload = reminderNotificationPayload(
      baseItem({ itemType: "task", title: "Submit assignment", reminderMinutesBefore: 60 }),
      "2026-08-15"
    );
    expect(payload.title).toBe("Task due soon");
    expect(payload.body).toBe("Submit assignment is due in 1 hour");
    expect(payload.body).not.toMatch(/start/i);
  });

  it("wording covers the zero-minute and 1-day offsets for both types", () => {
    expect(reminderNotificationPayload(baseItem({ reminderMinutesBefore: 0 }), "2026-08-15").body).toBe(
      "Lecture starts now"
    );
    expect(reminderNotificationPayload(baseItem({ reminderMinutesBefore: 1440 }), "2026-08-15").body).toBe(
      "Lecture starts tomorrow"
    );
    expect(
      reminderNotificationPayload(baseItem({ itemType: "task", reminderMinutesBefore: 0 }), "2026-08-15").body
    ).toBe("Lecture is due now");
    expect(
      reminderNotificationPayload(baseItem({ itemType: "task", reminderMinutesBefore: 1440 }), "2026-08-15").body
    ).toBe("Lecture is due tomorrow");
  });
});

describe("isOccurrenceCompleted", () => {
  it("a non-recurring item uses its own completed flag", () => {
    expect(isOccurrenceCompleted(baseItem({ completed: true }), "2026-08-15")).toBe(true);
    expect(isOccurrenceCompleted(baseItem({ completed: false }), "2026-08-15")).toBe(false);
  });

  it("a recurring item checks only the specific occurrence date", () => {
    const recurring = baseItem({ recurrence: "weekly", completedDates: "2026-08-03,2026-08-10" });
    expect(isOccurrenceCompleted(recurring, "2026-08-10")).toBe(true);
    // Completing one occurrence doesn't suppress a different one.
    expect(isOccurrenceCompleted(recurring, "2026-08-17")).toBe(false);
  });
});

describe("candidateOccurrenceDates", () => {
  it("a multi-day (non-recurring) event only ever yields its start date", () => {
    const dates = candidateOccurrenceDates(baseItem({ date: "2026-08-10" }), "2026-08-11");
    expect(dates).toEqual(["2026-08-10"]);
  });

  it("a weekly recurring event yields the matching occurrence within the scan window", () => {
    // Master is a Monday; scanning from a Sunday should still find Monday's
    // occurrence (needed for a 1-day-before reminder computed on Sunday).
    const item = baseItem({ date: "2026-08-03", recurrence: "weekly" }); // a Monday
    const dates = candidateOccurrenceDates(item, "2026-08-09"); // the following Sunday
    expect(dates).toContain("2026-08-10");
  });

  it("respects an explicit recurrenceEndDate", () => {
    const item = baseItem({ date: "2026-08-03", recurrence: "daily", recurrenceEndDate: "2026-08-05" });
    const dates = candidateOccurrenceDates(item, "2026-08-10");
    expect(dates).toEqual([]);
  });

  it("a weekday recurring task only yields weekday occurrences", () => {
    const item = baseItem({ date: "2026-08-03", recurrence: "weekdays" }); // Monday
    const dates = candidateOccurrenceDates(item, "2026-08-08"); // Saturday
    // 2026-08-08 is a Saturday, 2026-08-07 a Friday, 2026-08-09 a Sunday
    expect(dates).toContain("2026-08-07");
    expect(dates).not.toContain("2026-08-08");
    expect(dates).not.toContain("2026-08-09");
  });
});
