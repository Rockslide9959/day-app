import { describe, expect, it } from "vitest";
import {
  busyDayStats,
  dailySummary,
  nowNextEvent,
  overdueTasks,
  tasksDueToday,
  upcomingEvents,
  upcomingTasks,
  weeklyOverview,
} from "@/lib/calendar/dashboard";

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
    itemType: "event",
    ...overrides,
  };
}

function task(overrides: Partial<ReturnType<typeof ev>> = {}) {
  return ev({ itemType: "task", ...overrides });
}

describe("nowNextEvent", () => {
  it("finds the currently running event and the next one", () => {
    const events = [
      ev({ title: "Lecture", startTime: "08:00", endTime: "09:30" }),
      ev({ title: "Assignment work", startTime: "10:30", endTime: "12:00" }),
    ];
    // 9:00am -> during the lecture
    const result = nowNextEvent(events, 9 * 60);
    expect(result.current.map((e) => e.title)).toEqual(["Lecture"]);
    expect(result.next?.title).toBe("Assignment work");
    expect(result.minutesUntilNext).toBe(90);
  });

  it("returns no current events between meetings", () => {
    const events = [ev({ title: "Lecture", startTime: "08:00", endTime: "09:30" })];
    const result = nowNextEvent(events, 9 * 60 + 45);
    expect(result.current).toEqual([]);
    expect(result.next).toBeNull();
  });

  it("returns every event currently overlapping, not just one", () => {
    const events = [
      ev({ title: "Team standup", startTime: "09:00", endTime: "09:30" }),
      ev({ title: "1:1 with manager", startTime: "09:15", endTime: "10:00" }),
      ev({ title: "Later meeting", startTime: "14:00", endTime: "15:00" }),
    ];
    // 9:20am -> both the standup and the 1:1 are running
    const result = nowNextEvent(events, 9 * 60 + 20);
    expect(result.current.map((e) => e.title).sort()).toEqual(["1:1 with manager", "Team standup"]);
  });

  it("never treats a task as the currently running or next item", () => {
    const events = [task({ title: "Submit report", startTime: "09:00", endTime: "09:00" })];
    const result = nowNextEvent(events, 9 * 60);
    expect(result.current).toEqual([]);
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

  it("excludes tasks from event count and scheduled minutes", () => {
    const items = [
      ev({ startTime: "09:00", endTime: "10:00" }),
      task({ startTime: "12:00", endTime: "12:00" }),
      task({ startTime: "14:00", endTime: "14:00", allDay: true }),
    ];
    const stats = busyDayStats(items);
    expect(stats.eventCount).toBe(1);
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

  it("excludes tasks from the summary even when high priority", () => {
    const events = [
      ev({ startTime: "08:00", endTime: "09:00" }),
      task({ startTime: "07:00", endTime: "07:00", priority: "urgent" }),
    ];
    const summary = dailySummary(events);
    expect(summary.firstStart).toBe("08:00");
    expect(summary.highPriorityCount).toBe(0);
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

  it("excludes tasks — they get their own 'Tasks due' section", () => {
    const events = [task({ title: "Assignment due", date: "2026-08-16", category: "Assignment" })];
    expect(upcomingEvents(events, "2026-08-13")).toHaveLength(0);
  });
});

describe("tasksDueToday / overdueTasks / upcomingTasks", () => {
  const today = "2026-08-13";

  it("tasksDueToday returns only tasks due today, event or not", () => {
    const items = [
      task({ title: "Today task", date: today }),
      ev({ title: "Today event", date: today }),
      task({ title: "Tomorrow task", date: "2026-08-14" }),
    ];
    expect(tasksDueToday(items, today).map((t) => t.title)).toEqual(["Today task"]);
  });

  it("overdueTasks returns only incomplete tasks due before today", () => {
    const items = [
      task({ title: "Overdue", date: "2026-08-10", completed: false }),
      task({ title: "Overdue but done", date: "2026-08-11", completed: true }),
      task({ title: "Due today", date: today, completed: false }),
      ev({ title: "Overdue event", date: "2026-08-10" }),
    ];
    expect(overdueTasks(items, today).map((t) => t.title)).toEqual(["Overdue"]);
  });

  it("upcomingTasks returns only incomplete future tasks within the window", () => {
    const items = [
      task({ title: "Next week", date: "2026-08-18", completed: false }),
      task({ title: "Already done", date: "2026-08-18", completed: true }),
      task({ title: "Too far out", date: "2026-09-20", completed: false }),
      task({ title: "Today (excluded)", date: today, completed: false }),
    ];
    expect(upcomingTasks(items, today, 14).map((t) => t.title)).toEqual(["Next week"]);
  });
});
