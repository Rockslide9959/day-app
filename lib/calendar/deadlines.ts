import { diffDays } from "@/lib/dates";

export type DeadlineUrgency = "overdue" | "today" | "soon" | "normal";

export type DeadlineInfo = {
  daysUntil: number;
  label: string;
  urgency: DeadlineUrgency;
};

// `verb` lets callers phrase it as "Due" (assignments) or a more natural
// verb for other deadline-flavored categories ("Exam", etc.) — both read
// fine with "Due", so it's optional and defaults there.
export function deadlineInfo(dateStr: string, today: string, verb = "Due"): DeadlineInfo {
  const daysUntil = diffDays(today, dateStr);
  if (daysUntil < 0) {
    const days = Math.abs(daysUntil);
    return { daysUntil, label: `Overdue by ${days} day${days === 1 ? "" : "s"}`, urgency: "overdue" };
  }
  if (daysUntil === 0) return { daysUntil, label: `${verb} today`, urgency: "today" };
  if (daysUntil === 1) return { daysUntil, label: `${verb} tomorrow`, urgency: "soon" };
  return { daysUntil, label: `${verb} in ${daysUntil} days`, urgency: daysUntil <= 3 ? "soon" : "normal" };
}

export function countdownLabel(dateStr: string, today: string): string {
  const daysUntil = diffDays(today, dateStr);
  if (daysUntil < 0) return "Past";
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

// Finer-grained than `DeadlineUrgency` above — drives the red-to-neutral
// proximity color scale on dashboard date pills/accents, independent of
// whether the item is a deadline-flavored category.
// today: red, tomorrow: orange, 2-3 days: yellow, 4-7 days: green, 8+: neutral.
export type UrgencyTier = "overdue" | "today" | "tomorrow" | "soon" | "week" | "later";

export function urgencyTier(daysUntil: number): UrgencyTier {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  if (daysUntil <= 3) return "soon";
  if (daysUntil <= 7) return "week";
  return "later";
}
