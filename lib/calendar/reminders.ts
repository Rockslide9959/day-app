import { addDaysToDateStr } from "@/lib/dates";
import { expandOccurrenceDates, RecurrenceRule } from "@/lib/calendar/recurrence";
import { zonedTimeToUtc } from "@/lib/timezone";

// A task without a due time (allDay) is treated as due at 9:00 AM local —
// same default used for an all-day event's "start". Existing allDay rows
// always store startTime "00:00" (see lib/calendar/payload.ts), which isn't
// a meaningful explicit time, so this default applies unconditionally
// whenever allDay is set.
export const DEFAULT_ALLDAY_TIME = "09:00";

// Reminders whose due instant is more than this many minutes in the past are
// treated as missed rather than late — this is both the late-delivery grace
// period and the bounded catch-up window (nothing older ever gets picked
// up, so a deploy never triggers a flood of long-overdue reminders).
export const CATCHUP_WINDOW_MINUTES = 15;

// Cap on retrying a transient push failure for one (occurrence, device)
// delivery before giving up on it permanently.
export const MAX_DELIVERY_ATTEMPTS = 6;

export type ReminderableItem = RecurrenceRule & {
  id: string;
  itemType: string; // "event" | "task"
  title: string;
  date: string;
  startTime: string;
  allDay: boolean;
  reminderMinutesBefore: number | null;
  completed: boolean;
  completedDates: string;
};

export function occurrenceDueTime(item: Pick<ReminderableItem, "allDay" | "startTime">): string {
  return item.allDay ? DEFAULT_ALLDAY_TIME : item.startTime;
}

// Every occurrence date worth checking on a cron tick whose local "today"
// (in the item's own timezone) is `localToday` — a 4-day window is enough
// to cover every selectable reminder offset (max 1 day before) crossing a
// midnight boundary in either direction. Reuses the existing recurrence
// engine as-is (daily/weekly/monthly/weekdays/custom/end-date all handled
// there), and naturally yields just the start date for a multi-day event
// since it never expands across `endDate`.
export function candidateOccurrenceDates(item: ReminderableItem, localToday: string): string[] {
  return expandOccurrenceDates(item.date, item, {
    from: addDaysToDateStr(localToday, -1),
    to: addDaysToDateStr(localToday, 2),
  });
}

export function isOccurrenceCompleted(
  item: Pick<ReminderableItem, "recurrence" | "completed" | "completedDates">,
  occurrenceDate: string
): boolean {
  if (item.recurrence === "none" || item.recurrence === "") return item.completed;
  return item.completedDates.split(",").filter(Boolean).includes(occurrenceDate);
}

export function computeReminderInstant(
  item: Pick<ReminderableItem, "allDay" | "startTime" | "reminderMinutesBefore">,
  occurrenceDate: string,
  timeZone: string
): Date {
  const dueUtc = zonedTimeToUtc(occurrenceDate, occurrenceDueTime(item), timeZone);
  const offsetMinutes = item.reminderMinutesBefore ?? 0;
  return new Date(dueUtc.getTime() - offsetMinutes * 60_000);
}

function eventContinuation(minutes: number): string {
  if (minutes === 0) return "starts now";
  if (minutes === 60) return "starts in 1 hour";
  if (minutes === 1440) return "starts tomorrow";
  return `starts in ${minutes} minutes`;
}

function taskContinuation(minutes: number): string {
  if (minutes === 0) return "is due now";
  if (minutes === 60) return "is due in 1 hour";
  if (minutes === 1440) return "is due tomorrow";
  return `is due in ${minutes} minutes`;
}

export function reminderNotificationPayload(
  item: Pick<ReminderableItem, "itemType" | "title" | "reminderMinutesBefore">,
  occurrenceDate: string
): { title: string; body: string; url: string } {
  const minutes = item.reminderMinutesBefore ?? 0;
  const isTask = item.itemType === "task";
  return {
    title: isTask ? "Task due soon" : "Upcoming event",
    body: isTask ? `${item.title} ${taskContinuation(minutes)}` : `${item.title} ${eventContinuation(minutes)}`,
    url: `/calendar?date=${occurrenceDate}`,
  };
}
