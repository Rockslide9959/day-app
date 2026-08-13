export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayStr();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(
    tomorrow.getDate()
  ).padStart(2, "0")}`;

  if (dateStr === today) return "Today";
  if (dateStr === tomorrowStr) return "Tomorrow";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function dateStrToDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateToDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addMonthsToDateStr(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setMonth(date.getMonth() + months);
  return dateToDateStr(date);
}

// Sunday-start week containing dateStr.
export function startOfWeek(dateStr: string): string {
  const date = dateStrToDate(dateStr);
  date.setDate(date.getDate() - date.getDay());
  return dateToDateStr(date);
}

export function getWeekDates(dateStr: string): string[] {
  const start = startOfWeek(dateStr);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(start, i));
}

// 6 weeks x 7 days grid covering the month containing dateStr, padded with
// leading/trailing days from adjacent months so every week is full.
export function getMonthGrid(dateStr: string): string[][] {
  const [y, m] = dateStr.split("-").map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  const gridStart = startOfWeek(firstOfMonth);
  const weeks: string[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, () => {
      const d = cursor;
      cursor = addDaysToDateStr(cursor, 1);
      return d;
    }));
  }
  return weeks;
}

export function monthLabel(dateStr: string): string {
  const date = dateStrToDate(dateStr);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function weekRangeLabel(dateStr: string): string {
  const dates = getWeekDates(dateStr);
  const start = dateStrToDate(dates[0]);
  const end = dateStrToDate(dates[6]);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endLabel = sameMonth
    ? `${end.getDate()}, ${end.getFullYear()}`
    : end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export function dayLabel(dateStr: string): string {
  const date = dateStrToDate(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function isSameMonth(dateStr: string, referenceDateStr: string): boolean {
  return dateStr.slice(0, 7) === referenceDateStr.slice(0, 7);
}

// "09:30" -> 570
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// "570" -> "09:30"
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// b - a, in whole days. Both "YYYY-MM-DD".
export function diffDays(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((dateStrToDate(b).getTime() - dateStrToDate(a).getTime()) / msPerDay);
}

// Does the event's [date, endDate ?? date] span include targetDate?
export function eventCoversDate(
  date: string,
  endDate: string | null | undefined,
  targetDate: string
): boolean {
  const end = endDate || date;
  return date <= targetDate && targetDate <= end;
}
