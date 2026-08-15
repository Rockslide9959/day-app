// Reliable IANA timezone handling built on Node's built-in Intl/ICU support
// — no extra date library needed. Used by schedule reminders (see
// lib/calendar/reminders.ts) to convert a ScheduleItem's local date/time
// strings into the correct UTC instant regardless of server timezone.

// Existing ScheduleItem rows (and any invalid/missing value) fall back to
// this — chosen because it's the app's own primary user's timezone and has
// no DST to complicate the fallback.
export const DEFAULT_TIMEZONE_FALLBACK = "Africa/Johannesburg";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE_FALLBACK;
}

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return map;
}

// The local wall-clock "YYYY-MM-DD"/"HH:MM" in `timeZone`, converted to the
// UTC instant it represents. Standard guess-then-correct technique: format a
// first-guess UTC instant back through the target zone, measure how far its
// wall-clock reading is from the target, and correct — looped twice, which
// is enough to converge even across a DST transition.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const targetMs = Date.UTC(y, m - 1, d, h, min, 0, 0);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  let guessMs = targetMs;
  for (let i = 0; i < 2; i++) {
    const p = partsToMap(formatter.formatToParts(new Date(guessMs)));
    // Date.UTC normalizes an hour of 24 (some ICU builds emit it for
    // midnight under hour12:false) onto the next day correctly.
    const asZonedMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const diff = asZonedMs - targetMs;
    if (diff === 0) break;
    guessMs -= diff;
  }
  return new Date(guessMs);
}

// "Today" as a local "YYYY-MM-DD" string in `timeZone`, for windowing which
// occurrence dates are worth checking on a given cron tick.
export function zonedTodayStr(timeZone: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = partsToMap(formatter.formatToParts(now));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
