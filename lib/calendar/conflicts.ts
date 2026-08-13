export type TimeSpan = {
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  allDay?: boolean;
};

export function eventsOverlap(a: TimeSpan, b: TimeSpan): boolean {
  const aEnd = a.endDate || a.date;
  const bEnd = b.endDate || b.date;
  // No date overlap at all — never a conflict regardless of times.
  if (aEnd < b.date || bEnd < a.date) return false;

  const aMultiDay = a.date !== aEnd;
  const bMultiDay = b.date !== bEnd;
  // All-day or multi-day events only need date-range overlap to conflict.
  if (a.allDay || b.allDay || aMultiDay || bMultiDay) return true;

  // Both single-day timed events — must be the same day and overlap in time.
  if (a.date !== b.date) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export function findConflicts<T extends TimeSpan & { id: string; title: string }>(
  candidate: TimeSpan & { id?: string },
  events: T[]
): T[] {
  return events.filter((ev) => ev.id !== candidate.id && eventsOverlap(candidate, ev));
}
