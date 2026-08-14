import { addDaysToDateStr, timeToMinutes } from "@/lib/dates";
import { isDeadlineCategory } from "./categories";

export type DashboardEvent = {
  occurrenceId: string;
  title: string;
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  category: string | null;
  priority: string;
  completed: boolean;
  recurrence: string;
  // Optional so existing callers/tests that only deal in events (and never
  // set this) keep working unchanged — absent/non-"task" both mean "event".
  itemType?: string;
};

// Tasks are deadlines, not booked time — every dashboard calculation below
// only ever operates on events.
function onlyEvents<T extends DashboardEvent>(events: T[]): T[] {
  return events.filter((e) => e.itemType !== "task");
}

export function nowNextEvent<T extends DashboardEvent>(
  todayEvents: T[],
  nowMinutes: number
): { current: T[]; next: T | null; minutesUntilNext: number | null } {
  const timed = onlyEvents(todayEvents)
    .filter((e) => !e.allDay)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // Everything overlapping right now — there can be more than one (e.g.
  // two meetings double-booked), so this is every match, not just the
  // first.
  const current = timed.filter(
    (e) => timeToMinutes(e.startTime) <= nowMinutes && nowMinutes < timeToMinutes(e.endTime)
  );
  const next = timed.find((e) => timeToMinutes(e.startTime) > nowMinutes) || null;
  const minutesUntilNext = next ? timeToMinutes(next.startTime) - nowMinutes : null;

  return { current, next, minutesUntilNext };
}

export function busyDayStats(dayEvents: DashboardEvent[]): {
  eventCount: number;
  scheduledMinutes: number;
  isBusy: boolean;
} {
  const events = onlyEvents(dayEvents);
  const timed = events.filter((e) => !e.allDay);
  const scheduledMinutes = timed.reduce(
    (sum, e) => sum + Math.max(0, timeToMinutes(e.endTime) - timeToMinutes(e.startTime)),
    0
  );
  const eventCount = events.length;
  // "Busy" is a judgment call, not a precise threshold — 5+ things or 6+
  // scheduled hours reads as a genuinely full day for a personal calendar.
  const isBusy = eventCount >= 5 || scheduledMinutes >= 6 * 60;
  return { eventCount, scheduledMinutes, isBusy };
}

export function dailySummary<T extends DashboardEvent>(dayEvents: T[]) {
  const stats = busyDayStats(dayEvents);
  const events = onlyEvents(dayEvents);
  const timed = [...events]
    .filter((e) => !e.allDay)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const highPriorityCount = events.filter((e) => e.priority === "high" || e.priority === "urgent").length;

  return {
    eventCount: stats.eventCount,
    scheduledMinutes: stats.scheduledMinutes,
    firstStart: timed[0]?.startTime ?? null,
    lastEnd: timed[timed.length - 1]?.endTime ?? null,
    highPriorityCount,
    nextEvent: timed[0] ?? null,
  };
}

export function weeklyOverview(weekEvents: DashboardEvent[]) {
  const events = onlyEvents(weekEvents);
  const byDate = new Map<string, DashboardEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  let busiestDate: string | null = null;
  let busiestMinutes = -1;
  let lightestDate: string | null = null;
  let lightestMinutes = Infinity;
  for (const [date, evs] of byDate) {
    const { scheduledMinutes } = busyDayStats(evs);
    if (scheduledMinutes > busiestMinutes) {
      busiestMinutes = scheduledMinutes;
      busiestDate = date;
    }
    if (scheduledMinutes < lightestMinutes) {
      lightestMinutes = scheduledMinutes;
      lightestDate = date;
    }
  }

  const minutesByCategory: Record<string, number> = {};
  for (const e of events) {
    if (e.allDay) continue;
    const cat = e.category || "Other";
    const mins = Math.max(0, timeToMinutes(e.endTime) - timeToMinutes(e.startTime));
    minutesByCategory[cat] = (minutesByCategory[cat] || 0) + mins;
  }

  return {
    totalEvents: events.length,
    minutesByCategory,
    workoutCount: events.filter((e) => e.category === "Exercise").length,
    deadlineCount: events.filter((e) => isDeadlineCategory(e.category)).length,
    busiestDate,
    lightestDate,
  };
}

// "Upcoming" is deliberately not just "everything in the next N days" —
// that would mostly show routine recurring events. It surfaces the
// non-routine and important stuff: deadlines, high/urgent items, and any
// one-off (non-recurring) event.
export function upcomingEvents<T extends DashboardEvent>(events: T[], today: string, windowDays = 14): T[] {
  const cutoff = addDaysToDateStr(today, windowDays);
  return onlyEvents(events)
    .filter((e) => e.date > today && e.date <= cutoff)
    .filter(
      (e) => isDeadlineCategory(e.category) || e.priority === "high" || e.priority === "urgent" || e.recurrence === "none"
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    })
    .slice(0, 8);
}

// --- Task-specific dashboard helpers (Today/Home page) ---
// Separate from `upcomingEvents` above (which is deliberately event-only)
// so tasks get their own "Tasks due" surface instead of blending into the
// events list.

export function tasksDueToday<T extends DashboardEvent>(items: T[], today: string): T[] {
  return items.filter((e) => e.itemType === "task" && e.date === today);
}

export function overdueTasks<T extends DashboardEvent>(items: T[], today: string): T[] {
  return items
    .filter((e) => e.itemType === "task" && !e.completed && e.date < today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function upcomingTasks<T extends DashboardEvent>(items: T[], today: string, windowDays = 14): T[] {
  const cutoff = addDaysToDateStr(today, windowDays);
  return items
    .filter((e) => e.itemType === "task" && !e.completed && e.date > today && e.date <= cutoff)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
}
