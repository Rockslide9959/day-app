import { addDaysToDateStr, dateStrToDate, dateToDateStr } from "@/lib/dates";
import { isValidDateStr } from "@/lib/validation";

// Natural-language date/time extraction for the offline Quick Add parser.
// Every extractor works on a Scanner: it finds a phrase, records the value,
// and blanks that span out (same length, so later regexes still line up) —
// whatever survives every extractor becomes the item's title.

export class Scanner {
  readonly original: string;
  text: string;
  constructor(input: string) {
    this.original = input;
    this.text = input;
  }
  // Runs `re` against the unconsumed text; on a match, blanks it and
  // returns the match (indices are into both original and text).
  take(re: RegExp): RegExpExecArray | null {
    const m = this.find(re);
    if (m) this.consume(m);
    return m;
  }
  find(re: RegExp): RegExpExecArray | null {
    const flags = re.flags.includes("i") ? re.flags : re.flags + "i";
    return new RegExp(re.source, flags.replace("g", "")).exec(this.text);
  }
  consume(m: RegExpExecArray) {
    this.text = this.text.slice(0, m.index) + " ".repeat(m[0].length) + this.text.slice(m.index + m[0].length);
  }
  test(re: RegExp): boolean {
    return new RegExp(re.source, re.flags.includes("i") ? re.flags : re.flags + "i").test(this.text);
  }
  remaining(): string {
    return this.text.replace(/\s+/g, " ").trim();
  }
}

export const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

export const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const WEEKDAY_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)";

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2, few: 3,
};
const NUM_RE = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of|a few)";

function toNumber(s: string): number {
  const clean = s.toLowerCase().replace(/^a (couple|few) of$/, "$1");
  return /^\d+$/.test(clean) ? Number(clean) : NUMBER_WORDS[clean] ?? 1;
}

function weekdayOf(date: string) {
  return dateStrToDate(date).getDay();
}

function makeDate(y: number, m: number, d: number): string | null {
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidDateStr(s) ? s : null;
}

// Next date (today included when `includeToday`) falling on `weekday`.
function upcomingWeekday(today: string, weekday: number, includeToday: boolean): string {
  let diff = (weekday - weekdayOf(today) + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDaysToDateStr(today, diff);
}

export type DateHit = { date: string; explicit: boolean; timeHint?: string };

// `preferPast` (habit logs, journal) resolves bare dates like "the 3rd" or
// "Friday" backwards instead of forwards.
export function extractDate(s: Scanner, today: string, preferPast = false): DateHit | null {
  const [ty] = today.split("-").map(Number);
  let m: RegExpExecArray | null;

  // ISO
  if ((m = s.take(/\b(?:on\s+)?(\d{4})-(\d{2})-(\d{2})\b/))) {
    const d = makeDate(+m[1], +m[2], +m[3]);
    if (d) return { date: d, explicit: true };
  }

  if (s.take(/\b(?:on\s+)?(?:the\s+)?day\s+after\s+tomorrow\b/)) return { date: addDaysToDateStr(today, 2), explicit: true };
  if (s.take(/\b(?:the\s+)?day\s+before\s+yesterday\b/)) return { date: addDaysToDateStr(today, -2), explicit: true };
  if (s.take(/\b(?:by\s+|on\s+)?(?:tomorrow|tmrw|tmr|tomorow|tommorow|tommorrow)(?:\s+(morning|afternoon|evening|night))?\b/))
    return { date: addDaysToDateStr(today, 1), explicit: true };
  if ((m = s.take(/\b(?:by\s+)?tonight\b/))) return { date: today, explicit: true, timeHint: "20:00" };
  if (s.take(/\b(?:by\s+|for\s+)?(?:today|tdy)\b/)) return { date: today, explicit: true };
  if (s.take(/\byesterday\b|\blast\s+night\b/)) return { date: addDaysToDateStr(today, -1), explicit: true };

  // in N days / weeks / months, N days from now, N days ago
  if ((m = s.take(new RegExp(`\\bin\\s+${NUM_RE}\\s+(day|week|month|year)s?\\b|\\b${NUM_RE}\\s+(day|week|month|year)s?\\s+from\\s+(?:now|today)\\b`)))) {
    const n = toNumber(m[1] ?? m[3]);
    const unit = (m[2] ?? m[4]).toLowerCase();
    return { date: shift(today, unit, n), explicit: true };
  }
  if ((m = s.take(new RegExp(`\\b${NUM_RE}\\s+(day|week|month)s?\\s+ago\\b`)))) {
    return { date: shift(today, m[2].toLowerCase(), -toNumber(m[1])), explicit: true };
  }

  if (s.take(/\b(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+)?month\b/)) {
    const d = dateStrToDate(today);
    return { date: dateToDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)), explicit: true };
  }
  if (s.take(/\b(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+)?week\b/)) return { date: upcomingWeekday(today, 5, true), explicit: true };
  if (s.take(/\b(?:this\s+)?weekend\b/)) return { date: upcomingWeekday(today, 6, true), explicit: true };
  if (s.take(/\bnext\s+week\b/)) return { date: addDaysToDateStr(today, 7 - ((weekdayOf(today) + 6) % 7)), explicit: true };
  if (s.take(/\bnext\s+month\b/)) {
    const d = dateStrToDate(today);
    return { date: dateToDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1)), explicit: true };
  }

  // "15 October", "15th of Oct 2026", "the 15th of october"
  if ((m = s.take(new RegExp(`\\b(?:on\\s+|by\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?\\b`)))) {
    const d = resolveMonthDay(+m[1], MONTHS[m[2].toLowerCase()], m[3] ? +m[3] : null, today, preferPast);
    if (d) return { date: d, explicit: true };
  }
  // "October 15th", "Oct 15, 2026", "november the 9th"
  if ((m = s.take(new RegExp(`\\b(?:on\\s+|by\\s+)?${MONTH_RE}\\.?\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`)))) {
    const d = resolveMonthDay(+m[2], MONTHS[m[1].toLowerCase()], m[3] ? +m[3] : null, today, preferPast);
    if (d) return { date: d, explicit: true };
  }

  // next/this/coming Friday, last Friday, plain "Friday"/"on Fri"
  if ((m = s.take(new RegExp(`\\b(?:on\\s+|by\\s+)?(next|this|coming|last)\\s+${WEEKDAY_RE}\\b`)))) {
    const wd = WEEKDAYS[m[2].toLowerCase()];
    const which = m[1].toLowerCase();
    if (which === "last") {
      const back = ((weekdayOf(today) - wd + 7) % 7) || 7;
      return { date: addDaysToDateStr(today, -back), explicit: true };
    }
    if (which === "next") {
      // The one in next week (Mon-start), never this week's.
      const nextMonday = addDaysToDateStr(today, 7 - ((weekdayOf(today) + 6) % 7));
      return { date: addDaysToDateStr(nextMonday, (wd + 6) % 7), explicit: true };
    }
    return { date: upcomingWeekday(today, wd, true), explicit: true };
  }
  if ((m = s.take(new RegExp(`\\b(?:on\\s+|by\\s+)?${WEEKDAY_RE}\\b(?!\\s*(?:,|and|&|/)\\s*${WEEKDAY_RE})`)))) {
    const wd = WEEKDAYS[m[1].toLowerCase()];
    if (preferPast) {
      const back = (weekdayOf(today) - wd + 7) % 7;
      return { date: addDaysToDateStr(today, -back), explicit: true };
    }
    return { date: upcomingWeekday(today, wd, true), explicit: true };
  }

  // 15/10, 15/10/2026 (day-first)
  if ((m = s.take(/\b(?:on\s+|by\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    const d = resolveMonthDay(+m[1], +m[2], year, today, preferPast);
    if (d) return { date: d, explicit: true };
  }

  // "on the 15th" — this month, or next if already past
  if ((m = s.take(/\b(?:on\s+|by\s+)the\s+(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const d0 = dateStrToDate(today);
    let d = makeDate(ty, d0.getMonth() + 1, +m[1]);
    if (d && d < today && !preferPast) {
      const nm = new Date(d0.getFullYear(), d0.getMonth() + 1, +m[1]);
      d = dateToDateStr(nm);
    }
    if (d) return { date: d, explicit: true };
  }
  return null;
}

function shift(today: string, unit: string, n: number): string {
  if (unit === "day") return addDaysToDateStr(today, n);
  if (unit === "week") return addDaysToDateStr(today, n * 7);
  const d = dateStrToDate(today);
  if (unit === "month") return dateToDateStr(new Date(d.getFullYear(), d.getMonth() + n, d.getDate()));
  return dateToDateStr(new Date(d.getFullYear() + n, d.getMonth(), d.getDate()));
}

function resolveMonthDay(day: number, month: number, year: number | null, today: string, preferPast: boolean): string | null {
  const ty = Number(today.slice(0, 4));
  if (year) return makeDate(year, month, day);
  const thisYear = makeDate(ty, month, day);
  if (!thisYear) return null;
  if (!preferPast && thisYear < today) return makeDate(ty + 1, month, day);
  if (preferPast && thisYear > today) return makeDate(ty - 1, month, day);
  return thisYear;
}

// ---------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------

export type TimeHit = {
  start: string | null;
  end: string | null;
  durationMinutes: number | null;
  allDay: boolean;
  midnight: boolean; // "at midnight" — a deadline at the end of the day
  explicit: boolean; // an actual clock time was given (not just "morning")
};

const T = "(\\d{1,2})(?:[:.h](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.|a|p)?";

function hhmm(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function to24(hRaw: string, mRaw: string | undefined, mer: string | undefined, eveningContext: boolean): [number, number] | null {
  let h = Number(hRaw);
  const m = mRaw ? Number(mRaw) : 0;
  if (h > 23 || m > 59) return null;
  const meridiem = mer?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" || meridiem === "p") {
    if (h > 12) return null;
    if (h < 12) h += 12;
  } else if (meridiem === "am" || meridiem === "a") {
    if (h > 12) return null;
    if (h === 12) h = 0;
  } else if (h >= 1 && h <= 11 && !hRaw.startsWith("0")) {
    // No am/pm ("07:00" reads as 24-hour): 1–6 are almost always
    // afternoon/evening; 7–11 depend on whether the rest of the text
    // sounds like an evening plan.
    if (h <= 6 || eveningContext) h += 12;
  }
  return [h, m];
}

export const EVENING_WORDS = /\b(dinner|date|party|drinks|movie|movies|cinema|concert|show|bar|club|braai|supper|night|evening|gig|game night|pub)\b/i;

export function extractTime(s: Scanner): TimeHit {
  const hit: TimeHit = { start: null, end: null, durationMinutes: null, allDay: false, midnight: false, explicit: false };
  const evening = EVENING_WORDS.test(s.original);
  let m: RegExpExecArray | null;

  if (s.take(/\b(?:all[\s-]day|the\s+whole\s+day|full\s+day)\b/)) hit.allDay = true;

  // Ranges: "from 2 to 4pm", "2-4pm", "7pm until 9", "between 1 and 3".
  // Only consumed once it really looks like a time range, so "buy 2-3
  // apples" keeps its numbers.
  m =
    s.find(new RegExp(`\\bbetween\\s+${T}\\s*and\\s*${T}(?![\\w/])`)) ??
    s.find(new RegExp(`(?:\\bfrom\\s+)?\\b${T}\\s*(?:-|–|—|to|until|till|til)\\s*${T}(?![\\w/])`));
  if (m) {
    const looksLikeRange = m[3] || m[6] || m[2] || m[5] || /\b(from|between|to|until|till|til)\b/i.test(m[0]);
    if (looksLikeRange) {
      s.consume(m);
      // An unmarked start inherits the end's meridiem ("2-4pm"), unless that
      // would put it after the end ("11-1pm" is 11am–1pm).
      const endMer = m[6];
      let start = to24(m[1], m[2], m[3] ?? endMer, evening);
      const end = to24(m[4], m[5], m[6] ?? m[3], evening);
      if (start && end && !m[3] && endMer && start[0] * 60 + start[1] > end[0] * 60 + end[1]) {
        start = to24(m[1], m[2], "am", evening);
      }
      if (start && end) {
        hit.start = hhmm(...start);
        hit.end = hhmm(...end);
        hit.explicit = true;
      }
    }
  }

  if (!hit.start) {
    if (s.take(/\b(?:at\s+|by\s+|@\s*)?midnight\b/)) {
      hit.start = "23:59";
      hit.midnight = true;
      hit.explicit = true;
    } else if (s.take(/\b(?:at\s+|by\s+|@\s*)?(?:noon|midday|12\s*noon)\b/)) {
      hit.start = "12:00";
      hit.explicit = true;
    } else if (
      (m = s.take(new RegExp(`(?:\\b(?:and\\s+)?(?:at|by|from|around|about|@)\\s*|@\\s*)${T}(?![\\w/%])`))) ||
      (m = s.take(new RegExp(`\\b(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?![\\w])`))) ||
      (m = s.take(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))
    ) {
      const t = to24(m[1], m[2], m[3], evening);
      if (t) {
        hit.start = hhmm(...t);
        hit.explicit = true;
      }
    }
  }

  // Duration: "for 2 hours", "for 90 min", "for an hour", "for half an hour"
  if ((m = s.take(/\bfor\s+(?:(half\s+an?)|(\d+(?:\.\d+)?|an?|one|two|three|four)\s*(?:and\s+a\s+half\s+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/))) {
    if (m[1]) hit.durationMinutes = 30;
    else {
      const n = /^\d/.test(m[2]) ? Number(m[2]) : toNumber(m[2]);
      const half = /and\s+a\s+half/i.test(m[0]) ? 0.5 : 0;
      hit.durationMinutes = Math.round((/^h/i.test(m[3]) ? (n + half) * 60 : n));
    }
  }

  // Part-of-day fallback when no clock time was given.
  if (!hit.start && !hit.allDay) {
    if (s.take(/\b(?:(?:in|this|tomorrow)\s+(?:the\s+)?)?morning\b/)) hit.start = "09:00";
    else if (s.take(/\b(?:(?:in|this|tomorrow)\s+(?:the\s+)?)?afternoon\b/)) hit.start = "14:00";
    else if (s.take(/\b(?:(?:in|this|tomorrow)\s+(?:the\s+)?)?evening\b/)) hit.start = "18:00";
    else if (s.take(/\bat\s+lunch(?:time)?\b/)) hit.start = "12:00";
  }
  return hit;
}

export function addMinutes(time: string, minutes: number): { time: string; overflow: boolean } {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return { time: "23:59", overflow: true };
  return { time: hhmm(Math.floor(total / 60), total % 60), overflow: false };
}

// ---------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------

export type RecurrenceHit = { recurrence: "daily" | "weekly" | "weekdays" | "monthly" | "custom"; days: number[] };

export function extractRecurrence(s: Scanner): RecurrenceHit | null {
  let m: RegExpExecArray | null;
  if (s.take(/\b(?:every\s*day|everyday|each\s+day|daily|every\s+single\s+day)\b/)) return { recurrence: "daily", days: [] };
  if (s.take(/\b(?:every|each|on)\s+weekdays?\b|\bweekdays\b|\bmonday\s+(?:to|through|-)\s+friday\b|\bmon\s*-\s*fri\b/)) return { recurrence: "weekdays", days: [1, 2, 3, 4, 5] };
  if (s.take(/\b(?:every|each|on)\s+weekends?\b|\bweekends\b/)) return { recurrence: "custom", days: [0, 6] };
  // "every Monday and Wednesday", "on Tuesdays & Thursdays", "mon/wed/fri"
  const list = `${WEEKDAY_RE}s?(?:\\s*(?:,|and|&|/|\\+)\\s*${WEEKDAY_RE}s?)*`;
  if ((m = s.take(new RegExp(`\\b(?:every|each)\\s+(?:other\\s+)?${list}\\b`))) || (m = s.take(new RegExp(`\\bon\\s+(${WEEKDAY_RE}s(?:\\s*(?:,|and|&|/)\\s*${WEEKDAY_RE}s?)*)\\b`))) || (m = s.take(new RegExp(`\\b${WEEKDAY_RE}(?:\\s*(?:,|/|&|and)\\s*${WEEKDAY_RE}){1,6}\\b`)))) {
    const days = [...new Set(
      m[0]
        .toLowerCase()
        .match(new RegExp(WEEKDAY_RE, "g"))!
        .map((w) => WEEKDAYS[w])
    )].sort();
    return days.length === 1 ? { recurrence: "weekly", days } : { recurrence: "custom", days };
  }
  if (s.take(/\b(?:every\s+week|weekly|once\s+a\s+week)\b/)) return { recurrence: "weekly", days: [] };
  if (s.take(/\b(?:every\s+month|monthly|once\s+a\s+month)\b/)) return { recurrence: "monthly", days: [] };
  return null;
}
