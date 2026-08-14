import { minutesToTime, timeToMinutes } from "@/lib/dates";

export type BusySlot = { startTime: string; endTime: string };
export type FreeSlot = { startTime: string; endTime: string; minutes: number };

// Builds the busy list for a given day from loaded calendar items — tasks
// are deadlines, not reservations, so they're excluded here rather than at
// each call site, guaranteeing they never shrink free-time results.
export function busySlotsFromEvents<
  T extends { itemType: string; allDay: boolean; date: string; startTime: string; endTime: string }
>(events: T[], date: string): BusySlot[] {
  return events
    .filter((e) => e.itemType !== "task" && e.date === date && !e.allDay)
    .map((e) => ({ startTime: e.startTime, endTime: e.endTime }));
}

// Finds gaps of at least `durationMinutes` within [dayStart, dayEnd],
// given a day's busy time spans. Pure local computation — no AI, no
// external calls.
export function findFreeSlots(
  busy: BusySlot[],
  durationMinutes: number,
  dayStart = "07:00",
  dayEnd = "22:00"
): FreeSlot[] {
  const sorted = busy
    .map((b) => ({ s: timeToMinutes(b.startTime), e: timeToMinutes(b.endTime) }))
    .filter((b) => b.e > b.s)
    .sort((a, b) => a.s - b.s);

  const merged: { s: number; e: number }[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && b.s <= last.e) {
      last.e = Math.max(last.e, b.e);
    } else {
      merged.push({ ...b });
    }
  }

  const dayStartMin = timeToMinutes(dayStart);
  const dayEndMin = timeToMinutes(dayEnd);
  const free: FreeSlot[] = [];
  let cursor = dayStartMin;

  for (const b of merged) {
    const gapStart = Math.max(cursor, dayStartMin);
    if (b.s > gapStart && b.s - gapStart >= durationMinutes) {
      free.push({ startTime: minutesToTime(gapStart), endTime: minutesToTime(b.s), minutes: b.s - gapStart });
    }
    cursor = Math.max(cursor, b.e);
  }
  if (dayEndMin - cursor >= durationMinutes) {
    free.push({ startTime: minutesToTime(cursor), endTime: minutesToTime(dayEndMin), minutes: dayEndMin - cursor });
  }

  return free;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
