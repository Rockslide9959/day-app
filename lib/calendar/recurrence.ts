import { addDaysToDateStr, dateStrToDate, diffDays } from "@/lib/dates";

export type RecurrenceRule = {
  recurrence: string; // "none" | "daily" | "weekly" | "monthly" | "weekdays" | "custom"
  recurrenceDays: string | null; // comma-joined weekday numbers, 0=Sun..6=Sat
  recurrenceEndDate: string | null;
};

const MAX_ITERATIONS = 800; // ~2 years of days — a generous, safe bound

function matchesRule(dateStr: string, masterDate: string, rule: RecurrenceRule): boolean {
  const date = dateStrToDate(dateStr);
  const weekday = date.getDay();
  switch (rule.recurrence) {
    case "daily":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekly":
    case "custom": {
      if (rule.recurrenceDays) {
        const days = rule.recurrenceDays.split(",").filter(Boolean).map(Number);
        return days.includes(weekday);
      }
      // "weekly" with no explicit days repeats on the master's own weekday.
      return weekday === dateStrToDate(masterDate).getDay();
    }
    case "monthly":
      return date.getDate() === dateStrToDate(masterDate).getDate();
    default:
      return false;
  }
}

// Every occurrence date (inclusive, "YYYY-MM-DD") of a recurring event
// that falls within [range.from, range.to], bounded by the rule's own
// recurrenceEndDate if set. Deliberately simple: day-by-day scan rather
// than a general RFC 5545 engine — plenty fast for a personal calendar's
// handful of recurring events over a several-month window, and much
// easier to reason about correctly.
export function expandOccurrenceDates(
  masterDate: string,
  rule: RecurrenceRule,
  range: { from: string; to: string }
): string[] {
  if (rule.recurrence === "none" || rule.recurrence === "") {
    return masterDate >= range.from && masterDate <= range.to ? [masterDate] : [];
  }

  const effectiveEnd =
    rule.recurrenceEndDate && rule.recurrenceEndDate < range.to ? rule.recurrenceEndDate : range.to;
  if (masterDate > effectiveEnd) return [];

  const results: string[] = [];
  let cursor = masterDate > range.from ? masterDate : range.from;
  let guard = 0;
  while (cursor <= effectiveEnd && guard < MAX_ITERATIONS) {
    if (cursor >= masterDate && matchesRule(cursor, masterDate, rule)) {
      results.push(cursor);
    }
    cursor = addDaysToDateStr(cursor, 1);
    guard++;
  }
  return results;
}

export type ExpandableItem = {
  id: string;
  date: string;
  endDate: string | null;
  recurrence: string;
  recurrenceDays: string | null;
  recurrenceEndDate: string | null;
  completedDates: string;
  completed: boolean;
};

export type EventOccurrence<T extends ExpandableItem> = T & {
  // Distinct per occurrence — use for React keys / click targeting.
  occurrenceId: string;
  // The specific calendar date this occurrence falls on.
  occurrenceDate: string;
  isRecurringInstance: boolean;
};

// Expands one ScheduleItem (recurring or not) into the occurrence(s) that
// fall within range, substituting date/endDate per-occurrence and
// resolving `completed` from completedDates for recurring items.
export function expandEventOccurrences<T extends ExpandableItem>(
  item: T,
  range: { from: string; to: string }
): EventOccurrence<T>[] {
  if (item.recurrence === "none" || item.recurrence === "") {
    const end = item.endDate || item.date;
    if (end < range.from || item.date > range.to) return [];
    return [{ ...item, occurrenceId: item.id, occurrenceDate: item.date, isRecurringInstance: false }];
  }

  const spanDays = item.endDate ? diffDays(item.date, item.endDate) : 0;
  const dates = expandOccurrenceDates(item.date, item, range);
  const completedSet = new Set(item.completedDates.split(",").filter(Boolean));

  return dates.map((occDate) => ({
    ...item,
    date: occDate,
    endDate: spanDays > 0 ? addDaysToDateStr(occDate, spanDays) : occDate,
    completed: completedSet.has(occDate),
    occurrenceId: `${item.id}::${occDate}`,
    occurrenceDate: occDate,
    isRecurringInstance: true,
  }));
}
