import { formatTime12h } from "@/lib/dates";
import { scheduleLabel } from "@/lib/habits";
import type { QuickAction } from "./types";

// Pure, client-safe wording for Quick Add actions.

export function describeDate(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== t.getFullYear() ? { year: "numeric" } : {}),
  });
}

const RECURRENCE_LABEL: Record<string, string> = {
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

// What a parsed action will do, in words — shared by the live preview and
// the results list so both read the same.
export function describeAction(a: QuickAction, today: string): { icon: string; title: string; detail: string } {
  switch (a.kind) {
    case "event": {
      const when = a.startTime ? `${formatTime12h(a.startTime)}${a.endTime ? ` – ${formatTime12h(a.endTime)}` : ""}` : "All day";
      const repeat =
        a.recurrence === "none"
          ? null
          : a.recurrence === "custom" || (a.recurrence === "weekly" && a.recurrenceDays)
            ? scheduleLabel(a.recurrenceDays ?? "")
            : RECURRENCE_LABEL[a.recurrence];
      return {
        icon: "📅",
        title: a.title,
        detail: [repeat ? `${repeat} from ${describeDate(a.date, today)}` : describeDate(a.date, today), when, a.location, a.category]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "task":
      return {
        icon: a.priority === "normal" ? "🎯" : "🔥",
        title: a.title,
        detail: ["Due " + describeDate(a.date, today), a.dueTime ? formatTime12h(a.dueTime) : null, a.category, a.priority !== "normal" ? a.priority : null]
          .filter(Boolean)
          .join(" · "),
      };
    case "todo":
      return { icon: "☑️", title: a.title, detail: `To-do · ${describeDate(a.date, today)}` };
    case "todo_complete":
      return { icon: "✅", title: a.title, detail: "Mark to-do done" };
    case "habit_create":
      return {
        icon: a.emoji,
        title: a.name,
        detail: `New habit · ${a.target > 1 ? `${a.target}${a.unit ? ` ${a.unit}` : "×"} a day · ` : ""}${scheduleLabel(a.days)}`,
      };
    case "habit_log":
      return {
        icon: "🔥",
        title: a.habitName,
        detail: `Log habit · ${a.amount ? `+${a.amount}` : "Mark done"} · ${describeDate(a.date, today)}`,
      };
    case "note":
      return { icon: "📝", title: a.title, detail: "New note" };
    case "journal":
      return { icon: "📓", title: a.content.length > 60 ? a.content.slice(0, 60) + "…" : a.content, detail: `Journal · ${describeDate(a.date, today)}` };
  }
}
