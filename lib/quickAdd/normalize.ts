import { isValidDateStr, isValidTimeStr } from "@/lib/validation";
import { HABIT_COLORS, MAX_HABIT_COUNT, MAX_HABIT_NAME } from "@/lib/habits";
import type { QuickAction, QuickAddContext, Recurrence } from "./types";

// Turns the AI's loosely-typed output into QuickAction[], dropping anything
// that doesn't hold up (bad dates, unknown habit/todo ids, empty titles).
// The model is good, but nothing it returns reaches the database unchecked.

export type RawAction = {
  kind: string;
  title?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  end_date?: string | null;
  due_time?: string | null;
  location?: string | null;
  category?: string | null;
  priority?: string | null;
  recurrence?: string | null;
  recurrence_days?: string | null;
  notes?: string | null;
  todo_id?: string | null;
  habit_id?: string | null;
  amount?: number | null;
  habit_emoji?: string | null;
  habit_target?: number | null;
  habit_unit?: string | null;
  habit_days?: string | null;
  content?: string | null;
};

const RECURRENCES: Recurrence[] = ["none", "daily", "weekly", "weekdays", "monthly", "custom"];
const MAX_TITLE = 200;

function str(v: unknown, max = MAX_TITLE): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}
function date(v: unknown): string | null {
  return isValidDateStr(v) ? v : null;
}
function time(v: unknown): string | null {
  return isValidTimeStr(v) ? v : null;
}
function days(v: unknown): string | null {
  if (typeof v !== "string" || !/^[0-6](,[0-6])*$/.test(v.trim())) return null;
  return [...new Set(v.trim().split(",").map(Number))].sort().join(",");
}
function priority(v: unknown): "normal" | "high" | "urgent" {
  return v === "high" || v === "urgent" ? v : "normal";
}

export function normalizeActions(raw: RawAction[], ctx: QuickAddContext): QuickAction[] {
  const out: QuickAction[] = [];
  const category = (v: unknown) => {
    const c = str(v, 60);
    return c ? ctx.categories.find((x) => x.toLowerCase() === c.toLowerCase()) ?? null : null;
  };

  for (const a of raw.slice(0, 10)) {
    switch (a.kind) {
      case "event": {
        const title = str(a.title);
        const d = date(a.date);
        if (!title || !d) break;
        const start = time(a.start_time);
        let end = start ? time(a.end_time) : null;
        const endDate = date(a.end_date);
        if (start && (!end || (end <= start && (!endDate || endDate === d)))) {
          const [h, m] = start.split(":").map(Number);
          const t = Math.min(h * 60 + m + 60, 23 * 60 + 59);
          end = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        }
        const rec = RECURRENCES.includes(a.recurrence as Recurrence) ? (a.recurrence as Recurrence) : "none";
        out.push({
          kind: "event",
          title,
          date: d,
          startTime: start,
          endTime: end,
          endDate: endDate && endDate > d ? endDate : null,
          location: str(a.location),
          category: category(a.category),
          priority: priority(a.priority),
          recurrence: rec,
          recurrenceDays: rec === "weekly" || rec === "custom" ? days(a.recurrence_days) : null,
          notes: str(a.notes, 2000),
        });
        break;
      }
      case "task": {
        const title = str(a.title);
        const d = date(a.date);
        if (!title || !d) break;
        out.push({
          kind: "task",
          title,
          date: d,
          dueTime: time(a.due_time),
          category: category(a.category),
          priority: priority(a.priority),
          notes: str(a.notes, 2000),
        });
        break;
      }
      case "todo": {
        const title = str(a.title);
        if (!title) break;
        out.push({ kind: "todo", title, date: date(a.date) ?? ctx.today });
        break;
      }
      case "todo_complete": {
        const todo = ctx.openTodos.find((t) => t.id === a.todo_id);
        if (todo) out.push({ kind: "todo_complete", todoId: todo.id, title: todo.title });
        break;
      }
      case "habit_create": {
        const name = str(a.title, MAX_HABIT_NAME);
        if (!name) break;
        const target = Number.isInteger(a.habit_target) ? Math.min(MAX_HABIT_COUNT, Math.max(1, a.habit_target as number)) : 1;
        const colors = Object.keys(HABIT_COLORS);
        out.push({
          kind: "habit_create",
          name,
          emoji: str(a.habit_emoji, 16) ?? "✨",
          color: colors[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length],
          target,
          unit: target > 1 ? str(a.habit_unit, 20) : null,
          days: days(a.habit_days) ?? "",
        });
        break;
      }
      case "habit_log": {
        const habit = ctx.habits.find((h) => h.id === a.habit_id);
        if (!habit) break;
        const d = date(a.date) ?? ctx.today;
        out.push({
          kind: "habit_log",
          habitId: habit.id,
          habitName: habit.name,
          date: d > ctx.today ? ctx.today : d,
          amount: Number.isInteger(a.amount) && (a.amount as number) > 0 ? Math.min(MAX_HABIT_COUNT, a.amount as number) : null,
        });
        break;
      }
      case "note": {
        const content = str(a.content, 20000);
        const title = str(a.title) ?? (content ? content.split(/\s+/).slice(0, 7).join(" ") : null);
        if (!title) break;
        out.push({ kind: "note", title, content: content ?? "" });
        break;
      }
      case "journal": {
        const content = str(a.content, 20000);
        if (!content) break;
        const d = date(a.date) ?? ctx.today;
        out.push({ kind: "journal", date: d > ctx.today ? ctx.today : d, content });
        break;
      }
    }
  }
  return out;
}
