import { describe, expect, it } from "vitest";
import {
  bestStreak,
  completionRate,
  currentStreak,
  dayState,
  flameTier,
  HabitWithLogs,
  heatmapColumns,
  isDueOn,
  milestoneAt,
  nextMilestone,
  nextTapCount,
  parseHabitInput,
  scheduleLabel,
  summarizeHabit,
  weekCells,
} from "@/lib/habits";

// 2026-10-12 is a Monday.
const TODAY = "2026-10-12";

function habit(overrides: Partial<HabitWithLogs> = {}): HabitWithLogs {
  return {
    id: "h1",
    name: "Read",
    emoji: "📚",
    color: "emerald",
    target: 1,
    unit: null,
    days: "",
    archived: false,
    startDate: "2026-09-01",
    logs: {},
    ...overrides,
  };
}

function logsFor(dates: string[], count = 1) {
  return Object.fromEntries(dates.map((d) => [d, count]));
}

describe("isDueOn / scheduleLabel", () => {
  it("treats an empty schedule as every day", () => {
    expect(isDueOn("", TODAY)).toBe(true);
    expect(scheduleLabel("")).toBe("Every day");
  });

  it("only matches the listed weekdays", () => {
    expect(isDueOn("1,3,5", TODAY)).toBe(true); // Monday
    expect(isDueOn("0,6", TODAY)).toBe(false);
    expect(scheduleLabel("1,2,3,4,5")).toBe("Weekdays");
    expect(scheduleLabel("0,6")).toBe("Weekends");
    expect(scheduleLabel("1,3,5")).toBe("Mon · Wed · Fri");
  });
});

describe("currentStreak", () => {
  it("counts consecutive done days ending today", () => {
    const h = habit({ logs: logsFor(["2026-10-10", "2026-10-11", "2026-10-12"]) });
    expect(currentStreak(h, TODAY)).toBe(3);
  });

  it("does not break while today is still open", () => {
    const h = habit({ logs: logsFor(["2026-10-10", "2026-10-11"]) });
    expect(currentStreak(h, TODAY)).toBe(2);
  });

  it("breaks on a missed due day", () => {
    const h = habit({ logs: logsFor(["2026-10-09", "2026-10-11"]) });
    expect(currentStreak(h, TODAY)).toBe(1);
  });

  it("steps over rest days without breaking or counting them", () => {
    // Mon/Wed/Fri habit: Fri 9th, Wed 7th, Mon 5th all done; weekend is rest.
    const h = habit({ days: "1,3,5", logs: logsFor(["2026-10-05", "2026-10-07", "2026-10-09"]) });
    expect(currentStreak(h, TODAY)).toBe(3);
  });

  it("requires the full target for counter habits", () => {
    const h = habit({ target: 8, logs: { "2026-10-11": 8, "2026-10-10": 5 } });
    expect(currentStreak(h, TODAY)).toBe(1);
  });
});

describe("bestStreak", () => {
  it("finds the longest run in history", () => {
    const h = habit({
      logs: logsFor(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-10", "2026-09-11"]),
    });
    expect(bestStreak(h, TODAY)).toBe(4);
  });

  it("is zero with no logs", () => {
    expect(bestStreak(habit(), TODAY)).toBe(0);
  });
});

describe("completionRate", () => {
  it("ignores days before the habit started and an unfinished today", () => {
    const h = habit({ startDate: "2026-10-08", logs: logsFor(["2026-10-08", "2026-10-09", "2026-10-11"]) });
    // Due 8, 9, 10, 11 (today is open, so excluded) → 3 of 4.
    expect(completionRate(h, TODAY)).toBe(0.75);
  });
});

describe("dayState / weekCells / heatmapColumns", () => {
  it("labels each kind of day", () => {
    const h = habit({ days: "1,2,3,4,5", target: 4, logs: { "2026-10-09": 4, "2026-10-08": 2 } });
    expect(dayState(h, "2026-10-09", TODAY)).toBe("done");
    expect(dayState(h, "2026-10-08", TODAY)).toBe("partial");
    expect(dayState(h, "2026-10-07", TODAY)).toBe("missed");
    expect(dayState(h, "2026-10-11", TODAY)).toBe("rest");
    expect(dayState(h, TODAY, TODAY)).toBe("pending");
    expect(dayState(h, "2026-10-13", TODAY)).toBe("future");
    expect(dayState(h, "2026-08-01", TODAY)).toBe("before");
  });

  it("builds a Monday-start week", () => {
    expect(weekCells(habit(), TODAY).map((c) => c.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("builds week columns ending with the current week, with intensity levels", () => {
    const cols = heatmapColumns(habit({ target: 4, logs: { "2026-10-12": 2, "2026-10-05": 4 } }), TODAY, 3);
    expect(cols).toHaveLength(3);
    expect(cols[0][0].date).toBe("2026-09-28");
    expect(cols[2][0].date).toBe("2026-10-12");
    expect(cols[2][0].level).toBe(2);
    expect(cols[1][0].level).toBe(4);
  });
});

describe("milestones, flame, taps", () => {
  it("finds the next and exact milestones", () => {
    expect(nextMilestone(5)?.days).toBe(7);
    expect(milestoneAt(7)?.label).toBe("One week");
    expect(milestoneAt(8)).toBeNull();
    expect(nextMilestone(400)).toBeNull();
  });

  it("scales the flame with the streak", () => {
    expect([0, 1, 3, 7, 30].map(flameTier)).toEqual([0, 1, 2, 3, 4]);
  });

  it("toggles check habits and counts up counters", () => {
    expect(nextTapCount({ target: 1 }, 0)).toBe(1);
    expect(nextTapCount({ target: 1 }, 1)).toBe(0);
    expect(nextTapCount({ target: 8 }, 8)).toBe(9);
  });

  it("summarizes a habit", () => {
    const s = summarizeHabit(habit({ logs: logsFor(["2026-10-11", "2026-10-12"]) }), TODAY);
    expect(s).toMatchObject({ todayCount: 1, dueToday: true, doneToday: true, currentStreak: 2, totalDone: 2 });
  });
});

describe("parseHabitInput", () => {
  it("requires a name on create", () => {
    expect(parseHabitInput({}, false)).toEqual({ error: "name is required" });
  });

  it("allows partial edits", () => {
    expect(parseHabitInput({ archived: true }, true)).toEqual({ data: { archived: true } });
  });

  it("normalizes days and rejects bad values", () => {
    expect(parseHabitInput({ name: "x", days: "5,1,1" }, false)).toEqual({ data: { name: "x", days: "1,5" } });
    expect(parseHabitInput({ name: "x", days: "7" }, false)).toHaveProperty("error");
    expect(parseHabitInput({ name: "x", color: "plaid" }, false)).toHaveProperty("error");
    expect(parseHabitInput({ name: "x", target: 0 }, false)).toHaveProperty("error");
    expect(parseHabitInput({ name: "x", target: 1.5 }, false)).toHaveProperty("error");
  });
});
