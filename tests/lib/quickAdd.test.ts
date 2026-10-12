import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/lib/quickAdd/parse";
import type { QuickAddContext } from "@/lib/quickAdd/types";
import { DEFAULT_CATEGORIES } from "@/lib/calendar/categories";

// 2026-10-12 is a Monday.
const ctx: QuickAddContext = {
  today: "2026-10-12",
  nowMinutes: 9 * 60,
  timeZone: "Africa/Johannesburg",
  categories: DEFAULT_CATEGORIES.map((c) => c.name),
  habits: [
    { id: "h-water", name: "Drink water", emoji: "💧", target: 8, unit: "glasses" },
    { id: "h-read", name: "Read", emoji: "📚", target: 1, unit: null },
    { id: "h-meditate", name: "Meditate", emoji: "🧘", target: 1, unit: null },
  ],
  openTodos: [
    { id: "t-milk", title: "Buy milk" },
    { id: "t-mom", title: "Call mom (from Oct 10)" },
  ],
};

function one(text: string) {
  const actions = parseQuickAdd(text, ctx);
  expect(actions).toHaveLength(1);
  return actions[0];
}

describe("events", () => {
  it("date night on october 15th and 7pm", () => {
    expect(one("add date night on october 15th and 7pm")).toMatchObject({
      kind: "event",
      title: "Date night",
      date: "2026-10-15",
      startTime: "19:00",
      endTime: "21:00",
      category: "Social",
    });
  });

  it("assumes evening for bare hours in evening plans", () => {
    expect(one("dinner with Sam friday at 7")).toMatchObject({ kind: "event", title: "Dinner with Sam", date: "2026-10-16", startTime: "19:00" });
  });

  it("reads time ranges and locations", () => {
    expect(one("Team meeting tomorrow 2-3:30pm at Workshop17")).toMatchObject({
      kind: "event",
      title: "Team meeting",
      date: "2026-10-13",
      startTime: "14:00",
      endTime: "15:30",
      location: "Workshop17",
      category: "Work",
    });
  });

  it("handles durations", () => {
    expect(one("study session thursday 10am for 2 hours")).toMatchObject({
      date: "2026-10-15",
      startTime: "10:00",
      endTime: "12:00",
      category: "Study",
    });
  });

  it("makes all-day events when only a date is given", () => {
    expect(one("Mom's birthday on 3 November")).toMatchObject({ kind: "event", title: "Mom's birthday", date: "2026-11-03", startTime: null });
  });

  it("rolls past month-days into next year", () => {
    expect(one("conference on march 3")).toMatchObject({ date: "2027-03-03" });
  });

  it("creates recurring events", () => {
    expect(one("gym every monday and wednesday at 6am")).toMatchObject({
      kind: "event",
      title: "Gym",
      startTime: "06:00",
      recurrence: "custom",
      recurrenceDays: "1,3",
      date: "2026-10-12",
      category: "Exercise",
    });
  });

  it("understands relative dates", () => {
    expect(one("dentist in 3 days at 11:30")).toMatchObject({ date: "2026-10-15", startTime: "11:30", category: "Appointment" });
    expect(one("lunch with Thabo next friday at 1pm")).toMatchObject({ date: "2026-10-23", startTime: "13:00" });
    expect(one("movie tonight")).toMatchObject({ date: "2026-10-12", startTime: "20:00" });
  });

  it("strips calendar filler", () => {
    expect(one("put soccer practice on my calendar for saturday 9am")).toMatchObject({ title: "Soccer practice", date: "2026-10-17", startTime: "09:00" });
  });
});

describe("tasks", () => {
  it("project due on november 9th at midnight", () => {
    expect(one("i have a project due on november 9th at midnight add it to my calender")).toMatchObject({
      kind: "task",
      title: "Project",
      date: "2026-11-09",
      dueTime: "23:59",
      category: "Assignment",
    });
  });

  it("essay due friday", () => {
    expect(one("History essay due friday")).toMatchObject({ kind: "task", title: "History essay", date: "2026-10-16", dueTime: null });
  });

  it("by-date deadlines", () => {
    expect(one("submit tax return by the end of the month")).toMatchObject({ kind: "task", date: "2026-10-31" });
  });

  it("exam without a time is a deadline-style task", () => {
    expect(one("Physics exam on 20/11")).toMatchObject({ kind: "task", date: "2026-11-20", category: "Exam" });
  });

  it("marks priority", () => {
    expect(one("urgent: pay rent tomorrow")).toMatchObject({ kind: "task", priority: "urgent", date: "2026-10-13" });
  });
});

describe("to-dos", () => {
  it("plain text becomes a to-do for today", () => {
    expect(one("buy flowers")).toEqual({ kind: "todo", title: "Buy flowers", date: "2026-10-12" });
  });

  it("errands with a date but no time are to-dos for that day", () => {
    expect(one("buy flowers tomorrow")).toEqual({ kind: "todo", title: "Buy flowers", date: "2026-10-13" });
    expect(one("call the plumber on friday")).toEqual({ kind: "todo", title: "Call the plumber", date: "2026-10-16" });
  });

  it("todo prefix with a date", () => {
    expect(one("todo: pick up dry cleaning tomorrow")).toEqual({ kind: "todo", title: "Pick up dry cleaning", date: "2026-10-13" });
  });

  it("remind me to … at a time becomes a timed task", () => {
    expect(one("remind me to call the bank at 3pm")).toMatchObject({ kind: "task", title: "Call the bank", dueTime: "15:00" });
  });

  it("completes an existing to-do", () => {
    expect(one("done buy milk")).toEqual({ kind: "todo_complete", todoId: "t-milk", title: "Buy milk" });
    expect(one("called mom, mark call mom as done")).toBeTruthy();
    expect(one("mark call mom as done")).toMatchObject({ kind: "todo_complete", todoId: "t-mom" });
  });
});

describe("habits", () => {
  it("logs a counter habit with an amount", () => {
    expect(one("drank 3 glasses of water")).toEqual({ kind: "habit_log", habitId: "h-water", habitName: "Drink water", date: "2026-10-12", amount: 3 });
  });

  it("logs a check-off habit", () => {
    expect(one("read today")).toMatchObject({ kind: "habit_log", habitId: "h-read", amount: null });
    expect(one("meditated")).toMatchObject({ kind: "habit_log", habitId: "h-meditate" });
  });

  it("backfills yesterday", () => {
    expect(one("meditated yesterday")).toMatchObject({ kind: "habit_log", date: "2026-10-11" });
  });

  it("creates a new habit with a target", () => {
    expect(one("new habit: 10 push-ups every day")).toMatchObject({ kind: "habit_create", name: "Push-ups", target: 10, unit: "push-ups", emoji: "💪", days: "" });
    expect(one("start a habit to read 20 pages on weekdays")).toMatchObject({ kind: "habit_create", name: "Read", target: 20, unit: "pages", days: "1,2,3,4,5" });
  });

  it("doesn't mistake a scheduled run for a log", () => {
    expect(one("run tomorrow at 6am")).toMatchObject({ kind: "event" });
  });
});

describe("notes and journal", () => {
  it("creates notes", () => {
    expect(one("note: gift ideas - candle, book, socks")).toEqual({ kind: "note", title: "Gift ideas", content: "candle, book, socks" });
  });

  it("appends to the journal", () => {
    expect(one("journal: great day at the beach")).toEqual({ kind: "journal", date: "2026-10-12", content: "great day at the beach" });
  });
});

describe("multiple commands", () => {
  it("splits on new lines and semicolons", () => {
    const actions = parseQuickAdd("buy milk; dentist friday 10am\nnote: hello", ctx);
    expect(actions.map((a) => a.kind)).toEqual(["todo", "event", "note"]);
  });
});
