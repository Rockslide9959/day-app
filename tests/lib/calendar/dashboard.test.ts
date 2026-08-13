import { describe, expect, it } from "vitest";
import { busyDayStats, dailySummary, nowNextEvent, upcomingEvents, weeklyOverview } from "@/lib/calendar/dashboard";

function ev(overrides: Partial<Parameters<typeof upcomingEvents>[0][number]> = {}) {
  return {
    occurrenceId: overrides.occurrenceId || Math.random().toString(),
    title: "Event",
    date: "2026-08-13",
    endDate: null,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    category: null,
    priority: "normal",
    completed: false,
    recurrence: "none",
    ...overrides,
  };
}

describe("nowNextEvent", () => {
  it("finds the currently running event and the next one", () => {
    const events = [
      ev({ title: "Lecture", startTime: "08:00", endTime: "09:30" }),
      ev({ title: "Assignment work", startTime: "10:30", endTime: "12:00" }),
    ];
    // 9:00am -> during the lecture
    const result = nowNextEvent(events, 9 * 60);
    expect(result.current?.title).toBe("Lecture");
    expect(result.next?.title).toBe("Assignment work");
    expect(result.minutesUntilNext).toBe(90);
  });

  it("returns no current event between meetings", () => {
    const events = [ev({ title: "Lecture", startTime: "08:00", endTime: "09:30" })];
    const result = nowNextEvent(events, 9 * 60 + 45);
    expect(result.current).toBeNull();
    expect(result.next).toBeNull();
  });
});

describe("busyDayStats", () => {
  it("flags a day as busy past the event-count threshold", () => {
    const events = Array.from({ length: 5 }, (_, i) => ev({ startTime: `0${i + 1}:00`, endTime: `0${i + 1}:30` }));
    expect(busyDayStats(events).isBusy).toBe(true);
  });

  it("flags a light day as not busy", () => {
    const events = [ev({ startTime: "09:00", endTime: "10:00" })];
    const stats = busyDayStats(events);
    expect(stats.isBusy).toBe(false);
    expect(stats.scheduledMinutes).toBe(60);
  });
});

describe("dailySummary", () => {
  it("summarizes first/last event and high-priority count", () => {
    const events = [
      ev({ startTime: "08:00", endTime: "09:00", priority: "high" }),
      ev({ startTime: "17:00", endTime: "19:00" }),
    ];
    const summary = dailySummary(events);
    expect(summary.firstStart).toBe("08:00");
    expect(summary.lastEnd).toBe("19:00");
    expect(summary.highPriorityCount).toBe(1);
    expect(summary.scheduledMinutes).toBe(180);
  });
});

describe("weeklyOverview", () => {
  it("finds the busiest and lightest day and totals category time", () => {
    const events = [
      ev({ date: "2026-08-10", category: "Work", startTime: "09:00", endTime: "17:00" }),
      ev({ date: "2026-08-11", category: "Exercise", startTime: "17:00", endTime: "18:00" }),
    ];
    const overview = weeklyOverview(events);
    expect(overview.busiestDate).toBe("2026-08-10");
    expect(overview.lightestDate).toBe("2026-08-11");
    expect(overview.minutesByCategory["Work"]).toBe(480);
    expect(overview.workoutCount).toBe(1);
  });
});

describe("upcomingEvents", () => {
  it("includes deadline-category and high-priority items but excludes routine recurring ones", () => {
    const events = [
      ev({ title: "Assignment due", date: "2026-08-16", category: "Assignment" }),
      ev({ title: "Daily standup", date: "2026-08-14", recurrence: "daily" }),
      ev({ title: "Doctor", date: "2026-08-18", recurrence: "none" }),
    ];
    const upcoming = upcomingEvents(events, "2026-08-13");
    const titles = upcoming.map((e) => e.title);
    expect(titles).toContain("Assignment due");
    expect(titles).toContain("Doctor");
    expect(titles).not.toContain("Daily standup");
  });

  it("excludes events happening today (that's the Today section's job)", () => {
    const events = [ev({ title: "Today's exam", date: "2026-08-13", category: "Exam" })];
    expect(upcomingEvents(events, "2026-08-13")).toHaveLength(0);
  });
});
