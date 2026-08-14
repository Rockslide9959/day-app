import { describe, expect, it } from "vitest";
import { isScheduleItemVisible, taskDeadline } from "@/lib/calendar/visibility";

function task(overrides: Partial<Parameters<typeof isScheduleItemVisible>[0]> = {}) {
  return {
    itemType: "task",
    completed: false,
    date: "2026-08-14",
    startTime: "00:00",
    allDay: true,
    ...overrides,
  };
}

describe("taskDeadline", () => {
  it("is the end of the local due date when there's no due time", () => {
    const deadline = taskDeadline("2026-08-14", "00:00", true);
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(7); // 0-indexed August
    expect(deadline.getDate()).toBe(14);
    expect(deadline.getHours()).toBe(23);
    expect(deadline.getMinutes()).toBe(59);
  });

  it("is the due date at the due time when one is set", () => {
    const deadline = taskDeadline("2026-08-14", "17:30", false);
    expect(deadline.getDate()).toBe(14);
    expect(deadline.getHours()).toBe(17);
    expect(deadline.getMinutes()).toBe(30);
  });
});

describe("isScheduleItemVisible", () => {
  it("events are always visible regardless of completion or date", () => {
    const now = new Date(2026, 7, 20);
    expect(isScheduleItemVisible({ itemType: "event", completed: true, date: "2026-01-01", startTime: "00:00", allDay: true }, now)).toBe(true);
  });

  it("an incomplete task is visible even when overdue", () => {
    const now = new Date(2026, 7, 20);
    const overdueIncomplete = task({ completed: false, date: "2026-08-01" });
    expect(isScheduleItemVisible(overdueIncomplete, now)).toBe(true);
  });

  it("a completed task due in the future is visible", () => {
    const now = new Date(2026, 7, 10);
    const completedFuture = task({ completed: true, date: "2026-08-20" });
    expect(isScheduleItemVisible(completedFuture, now)).toBe(true);
  });

  it("a completed task hides once its due moment has passed", () => {
    const now = new Date(2026, 7, 15);
    const completedPast = task({ completed: true, date: "2026-08-10" });
    expect(isScheduleItemVisible(completedPast, now)).toBe(false);
  });

  it("a date-only completed task stays visible through the end of its local due date", () => {
    const dueDate = task({ completed: true, date: "2026-08-14", allDay: true });
    const stillOnDueDate = new Date(2026, 7, 14, 23, 30);
    const afterDueDate = new Date(2026, 7, 15, 0, 1);
    expect(isScheduleItemVisible(dueDate, stillOnDueDate)).toBe(true);
    expect(isScheduleItemVisible(dueDate, afterDueDate)).toBe(false);
  });

  it("a completed task with a due time hides right after that time passes", () => {
    const withTime = task({ completed: true, date: "2026-08-14", startTime: "17:00", allDay: false });
    const beforeDeadline = new Date(2026, 7, 14, 16, 59);
    const afterDeadline = new Date(2026, 7, 14, 17, 1);
    expect(isScheduleItemVisible(withTime, beforeDeadline)).toBe(true);
    expect(isScheduleItemVisible(withTime, afterDeadline)).toBe(false);
  });
});
