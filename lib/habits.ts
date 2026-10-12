import { addDaysToDateStr, dateStrToDate, startOfWeek } from "@/lib/dates";

// Pure habit math — streaks, heatmap cells, milestones — shared by the API
// routes and the client. The client recomputes summaries locally after an
// optimistic log, so a tap shows its new streak instantly instead of waiting
// on a round trip; keeping one implementation means the two never disagree.

export type HabitWithLogs = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  target: number;
  unit: string | null;
  days: string;
  archived: boolean;
  // Local "YYYY-MM-DD" the habit started on (first day it can be missed).
  startDate: string;
  // date → count for every logged day with count > 0.
  logs: Record<string, number>;
};

// "done" — hit the target; "partial" — some progress, under target;
// "missed" — due, past, nothing logged; "pending" — due today, not done yet;
// "rest" — not a scheduled day; "future"/"before" — outside the habit's life.
export type DayState = "done" | "partial" | "missed" | "pending" | "rest" | "future" | "before";

export type DayCell = { date: string; count: number; state: DayState; level: 0 | 1 | 2 | 3 | 4 };

export type HabitSummary = {
  todayCount: number;
  dueToday: boolean;
  doneToday: boolean;
  currentStreak: number;
  bestStreak: number;
  // 0–1 share of due days hit over the last 30 days (since the habit began).
  rate30: number;
  totalDone: number;
  week: DayCell[];
};

// How far back streaks/heatmaps look. Logs older than this aren't loaded,
// so a streak longer than this many days reads as capped at it.
export const HABIT_HISTORY_DAYS = 400;

export const HABIT_COLORS: Record<string, string> = {
  emerald: "#10b981",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  amber: "#f59e0b",
  orange: "#f97316",
  teal: "#14b8a6",
  fuchsia: "#d946ef",
  lime: "#84cc16",
  indigo: "#6366f1",
};

export function habitColor(key: string): string {
  return HABIT_COLORS[key] ?? HABIT_COLORS.emerald;
}

// Streak lengths worth celebrating. 66 is the oft-cited average for a
// behaviour to become automatic.
export const MILESTONES: { days: number; label: string; icon: string }[] = [
  { days: 3, label: "Spark", icon: "✨" },
  { days: 7, label: "One week", icon: "🔥" },
  { days: 14, label: "Fortnight", icon: "⚡" },
  { days: 30, label: "Month strong", icon: "🌙" },
  { days: 66, label: "Habit formed", icon: "🧠" },
  { days: 100, label: "Century", icon: "💯" },
  { days: 365, label: "Full orbit", icon: "🪐" },
];

export function parseDays(days: string): number[] {
  return days
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

export function isDueOn(days: string, dateStr: string): boolean {
  const list = parseDays(days);
  return list.length === 0 || list.includes(dateStrToDate(dateStr).getDay());
}

export function scheduleLabel(days: string): string {
  const list = [...new Set(parseDays(days))].sort();
  if (list.length === 0 || list.length === 7) return "Every day";
  if (list.join(",") === "1,2,3,4,5") return "Weekdays";
  if (list.join(",") === "0,6") return "Weekends";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return list.map((d) => names[d]).join(" · ");
}

function countOn(habit: HabitWithLogs, date: string): number {
  return habit.logs[date] ?? 0;
}

export function dayState(habit: HabitWithLogs, date: string, today: string): DayState {
  if (date > today) return "future";
  const count = countOn(habit, date);
  if (count >= habit.target) return "done";
  if (date < habit.startDate && count === 0) return "before";
  if (!isDueOn(habit.days, date)) return count > 0 ? "partial" : "rest";
  if (date === today) return count > 0 ? "partial" : "pending";
  return count > 0 ? "partial" : "missed";
}

function cell(habit: HabitWithLogs, date: string, today: string): DayCell {
  const count = countOn(habit, date);
  const ratio = Math.min(1, count / habit.target);
  const level = (count <= 0 ? 0 : ratio >= 1 ? 4 : Math.max(1, Math.ceil(ratio * 3))) as DayCell["level"];
  return { date, count, state: dayState(habit, date, today), level };
}

// Consecutive due days hit, ending today — or yesterday, while today is
// still open (an unfinished today never breaks a streak until it's over).
// Rest days are stepped over without counting or breaking.
export function currentStreak(habit: HabitWithLogs, today: string): number {
  let date = today;
  if (countOn(habit, today) < habit.target) date = addDaysToDateStr(today, -1);
  let streak = 0;
  for (let i = 0; i < HABIT_HISTORY_DAYS; i++) {
    if (isDueOn(habit.days, date)) {
      if (countOn(habit, date) < habit.target) break;
      streak++;
    }
    date = addDaysToDateStr(date, -1);
  }
  return streak;
}

export function bestStreak(habit: HabitWithLogs, today: string): number {
  const logged = Object.keys(habit.logs).filter((d) => d <= today).sort();
  if (logged.length === 0) return 0;
  let best = 0;
  let run = 0;
  for (let date = logged[0]; date <= today; date = addDaysToDateStr(date, 1)) {
    if (!isDueOn(habit.days, date)) continue;
    if (countOn(habit, date) >= habit.target) {
      run++;
      best = Math.max(best, run);
    } else if (date !== today) {
      run = 0;
    }
  }
  return best;
}

export function completionRate(habit: HabitWithLogs, today: string, windowDays = 30): number {
  let due = 0;
  let hit = 0;
  for (let i = 0; i < windowDays; i++) {
    const date = addDaysToDateStr(today, -i);
    if (date < habit.startDate) break;
    if (!isDueOn(habit.days, date)) continue;
    const done = countOn(habit, date) >= habit.target;
    // Today only counts once it's done — it isn't a miss yet.
    if (date === today && !done) continue;
    due++;
    if (done) hit++;
  }
  return due === 0 ? 0 : hit / due;
}

// Monday-start current week, for the 7-dot strip.
export function weekCells(habit: HabitWithLogs, today: string): DayCell[] {
  const monday = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => cell(habit, addDaysToDateStr(monday, i), today));
}

// GitHub-style grid: `weeks` Monday-start columns ending with this week.
export function heatmapColumns(habit: HabitWithLogs, today: string, weeks = 20): DayCell[][] {
  const firstMonday = addDaysToDateStr(startOfWeek(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => cell(habit, addDaysToDateStr(firstMonday, w * 7 + d), today))
  );
}

export function nextMilestone(streak: number) {
  return MILESTONES.find((m) => m.days > streak) ?? null;
}

// The milestone landed on exactly, if this streak value is one.
export function milestoneAt(streak: number) {
  return MILESTONES.find((m) => m.days === streak) ?? null;
}

// 0 (no streak) → 4 (blazing); drives the flame's size and glow.
export function flameTier(streak: number): 0 | 1 | 2 | 3 | 4 {
  if (streak <= 0) return 0;
  if (streak < 3) return 1;
  if (streak < 7) return 2;
  if (streak < 30) return 3;
  return 4;
}

export function summarizeHabit(habit: HabitWithLogs, today: string): HabitSummary {
  const todayCount = countOn(habit, today);
  return {
    todayCount,
    dueToday: isDueOn(habit.days, today),
    doneToday: todayCount >= habit.target,
    currentStreak: currentStreak(habit, today),
    bestStreak: bestStreak(habit, today),
    rate30: completionRate(habit, today),
    totalDone: Object.entries(habit.logs).filter(([d, c]) => d <= today && c >= habit.target).length,
    week: weekCells(habit, today),
  };
}

// What one tap on a habit's ring does: toggles a yes/no habit, and counts
// a counter habit up by one (past its target too — extra credit is fine).
export function nextTapCount(habit: Pick<HabitWithLogs, "target">, current: number): number {
  if (habit.target === 1) return current >= 1 ? 0 : 1;
  return Math.min(MAX_HABIT_COUNT, current + 1);
}

export const MAX_HABIT_COUNT = 999;
export const MAX_HABIT_NAME = 60;

export type HabitInput = {
  name?: string;
  emoji?: string;
  color?: string;
  target?: number;
  unit?: string | null;
  days?: string;
  archived?: boolean;
  sortOrder?: number;
};

// Validates a create (partial: false) or edit (partial: true) body,
// returning either the clean fields to write or an error message.
export function parseHabitInput(
  body: unknown,
  partial: boolean
): { data: HabitInput } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const data: HabitInput = {};

  if (b.name !== undefined || !partial) {
    if (typeof b.name !== "string" || !b.name.trim()) return { error: "name is required" };
    if (b.name.trim().length > MAX_HABIT_NAME) return { error: `name must be at most ${MAX_HABIT_NAME} characters` };
    data.name = b.name.trim();
  }
  if (b.emoji !== undefined) {
    if (typeof b.emoji !== "string" || !b.emoji.trim() || b.emoji.length > 16) return { error: "emoji is invalid" };
    data.emoji = b.emoji.trim();
  }
  if (b.color !== undefined) {
    if (typeof b.color !== "string" || !(b.color in HABIT_COLORS)) return { error: "color is invalid" };
    data.color = b.color;
  }
  if (b.target !== undefined) {
    if (!Number.isInteger(b.target) || (b.target as number) < 1 || (b.target as number) > MAX_HABIT_COUNT) {
      return { error: `target must be a whole number from 1 to ${MAX_HABIT_COUNT}` };
    }
    data.target = b.target as number;
  }
  if (b.unit !== undefined) {
    if (b.unit !== null && (typeof b.unit !== "string" || b.unit.length > 20)) return { error: "unit is invalid" };
    data.unit = typeof b.unit === "string" && b.unit.trim() ? b.unit.trim() : null;
  }
  if (b.days !== undefined) {
    if (typeof b.days !== "string" || !/^([0-6](,[0-6])*)?$/.test(b.days)) {
      return { error: "days must be comma-separated weekday numbers 0-6" };
    }
    data.days = [...new Set(parseDays(b.days))].sort().join(",");
  }
  if (b.archived !== undefined) {
    if (typeof b.archived !== "boolean") return { error: "archived must be a boolean" };
    data.archived = b.archived;
  }
  if (b.sortOrder !== undefined) {
    if (!Number.isInteger(b.sortOrder)) return { error: "sortOrder must be an integer" };
    data.sortOrder = b.sortOrder as number;
  }
  return { data };
}
