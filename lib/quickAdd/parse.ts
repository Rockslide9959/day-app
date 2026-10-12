import { addMinutes, EVENING_WORDS, extractDate, extractRecurrence, extractTime, Scanner } from "./dates";
import type { QuickAction, QuickAddContext, Recurrence } from "./types";

// Offline, rule-based Quick Add interpreter. Used for the live preview as
// you type, and as the whole engine when no ANTHROPIC_API_KEY is
// configured (see ai.ts). Pure — safe to run on client and server.

// Splits "a; b" or one command per line. Plain "and" is left alone — too
// many titles contain it ("date night on the 15th and 7pm").
export function splitCommands(text: string): string[] {
  return text
    .split(/\n|;|\s+(?:and\s+)?also\s+|\.\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAction[] {
  return splitCommands(text).flatMap((segment) => {
    const action = parseSegment(segment, ctx);
    return action ? [action] : [];
  });
}

// ---------------------------------------------------------------------
// Keyword tables
// ---------------------------------------------------------------------

const CATEGORY_RULES: [RegExp, string][] = [
  [/\b(exam|exams|final|finals)\b/i, "Exam"],
  [/\b(test|quiz|midterm|semester test)\b/i, "Test"],
  [/\b(assignment|essay|project|homework|hw|report|paper|lab report|thesis|dissertation|submission|presentation)\b/i, "Assignment"],
  [/\b(lecture|class|tutorial|tut|seminar|practical|prac|lab|lesson)\b/i, "University"],
  [/\b(study|studying|revise|revision|review)\b/i, "Study"],
  [/\b(gym|workout|work out|run|running|jog|swim|swimming|yoga|pilates|training|practice|match|cycle|cycling|hike|hiking|football|soccer|rugby|cricket|tennis|padel|crossfit|spin)\b/i, "Exercise"],
  [/\b(doctor|dentist|dr\.?|appointment|appt|checkup|check-up|therapy|therapist|physio|optometrist|haircut|barber|hairdresser|clinic|hospital|vet)\b/i, "Appointment"],
  [/\b(meeting|standup|stand-up|shift|work|interview|call with|1:1|one on one|client|office)\b/i, "Work"],
  [/\b(date|dinner|lunch|brunch|breakfast|party|drinks|birthday|bday|braai|wedding|movie|movies|concert|hangout|hang out|catch up|catch-up|coffee|games night|game night|festival|show)\b/i, "Social"],
];

function inferCategory(text: string, categories: string[]): string | null {
  // Custom categories the user made win when their name is mentioned.
  const custom = categories.find((c) => new RegExp(`\\b${escapeRe(c)}\\b`, "i").test(text));
  if (custom) return custom;
  for (const [re, cat] of CATEGORY_RULES) if (re.test(text) && categories.includes(cat)) return cat;
  return null;
}

const HABIT_EMOJI: [RegExp, string][] = [
  [/\b(water|hydrat|drink)/i, "💧"],
  [/\b(read|book|pages)/i, "📚"],
  [/\b(run|jog|km)/i, "🏃"],
  [/\b(walk|steps)/i, "🚶"],
  [/\b(gym|workout|lift|push-?ups|sit-?ups|exercise|reps)/i, "💪"],
  [/\b(meditat|mindful|breath)/i, "🧘"],
  [/\b(sleep|bed)/i, "😴"],
  [/\b(journal|write|writing)/i, "✍️"],
  [/\b(guitar|piano|music|practi[cs]e)/i, "🎸"],
  [/\b(clean|tidy)/i, "🧹"],
  [/\b(vitamin|pill|meds|medication)/i, "💊"],
  [/\b(veg|fruit|salad|eat|diet)/i, "🥗"],
  [/\b(pray|gratitude|grateful)/i, "🙏"],
  [/\b(phone|screen|social media|no scroll)/i, "📵"],
  [/\b(stretch|yoga)/i, "🧘"],
  [/\b(floss|teeth)/i, "🦷"],
  [/\b(code|coding|program)/i, "💻"],
  [/\b(study|learn|duolingo|language)/i, "🧠"],
  [/\b(cycle|bike)/i, "🚴"],
  [/\b(draw|paint|art)/i, "🎨"],
];
const HABIT_COLORS = ["emerald", "sky", "violet", "rose", "amber", "orange", "teal", "fuchsia", "lime", "indigo"];

const ERRAND_VERB =
  /^(?:buy|get|grab|pick\s+up|drop\s+off|collect|call|ring|phone|email|e-mail|text|message|reply|send|post|pay|order|return|cancel|renew|book|clean|tidy|wash|fix|sort|organi[sz]e|print|write|finish|prepare|pack|check|do|make|cook|water|feed|charge|download|upload|update|backup|back\s+up|file|sign|schedule|research|look\s+into|ask|tell|remind|thank|invite|confirm|apply|register|read|watch|listen|practi[cs]e|study|review|revise)\b/i;

const UNIT_RE =
  "(glasses|glass|cups?|bottles?|litres?|liters?|l|ml|pages?|chapters?|minutes?|mins?|min|hours?|hrs?|km|kms|kilometres?|kilometers?|miles?|steps|reps|push-?ups|sit-?ups|squats|times|x|sessions?|words|lessons?|servings?)";

const LOG_VERB =
  /^(?:i\s+)?(log|logged|did|done|finished|completed|drank|drink|had|read|ran|run|walked|walk|meditated|meditate|went\s+to(?:\s+the)?|hit|track(?:ed)?|just)\b/i;

// Loose stems so "drank"/"drinking" find "Drink water", "ran" finds "Run".
const SYNONYMS: Record<string, string[]> = {
  drink: ["drank", "drinking", "drinks", "water", "hydrate"],
  water: ["drank", "drink", "glasses", "glass", "cups"],
  read: ["reading", "pages", "book", "chapter"],
  run: ["ran", "running", "jog", "jogged", "km"],
  walk: ["walked", "walking", "steps"],
  gym: ["workout", "worked", "lifted", "training", "trained", "exercise", "exercised"],
  workout: ["gym", "worked", "exercise", "trained"],
  exercise: ["gym", "workout", "exercised", "trained"],
  meditate: ["meditated", "meditation", "meditating"],
  meditation: ["meditated", "meditate"],
  stretch: ["stretched", "stretching"],
  journal: ["journaled", "journalled", "wrote"],
  sleep: ["slept"],
  floss: ["flossed"],
  study: ["studied", "studying"],
  practice: ["practiced", "practised"],
  pray: ["prayed"],
  cook: ["cooked"],
  clean: ["cleaned"],
};

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}
const STOP = new Set(["the", "a", "an", "my", "to", "of", "for", "and", "on", "in", "at", "i", "it", "some", "with", "today", "yesterday"]);

function stem(w: string) {
  return w.replace(/(ing|ed|es|s)$/, "");
}

function habitMatchScore(text: string, habit: { name: string; unit: string | null }): number {
  const textWords = new Set(words(text).flatMap((w) => [w, stem(w)]));
  let score = 0;
  for (const hw of words(habit.name)) {
    const variants = [hw, stem(hw), ...(SYNONYMS[hw] ?? []), ...(SYNONYMS[stem(hw)] ?? [])];
    if (variants.some((v) => textWords.has(v) || textWords.has(stem(v)))) score += hw.length > 3 ? 2 : 1;
  }
  if (habit.unit && words(habit.unit).some((u) => textWords.has(u) || textWords.has(stem(u)))) score += 1;
  return score;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------
// Title cleanup
// ---------------------------------------------------------------------

const CALENDAR_WORD = "(?:calendar|calender|calander|calendr|schedule|diary|planner|cal|agenda)";

function cleanTitle(raw: string): string {
  let t = ` ${raw} `;
  const strip = (re: RegExp) => {
    t = t.replace(re, " ");
  };
  strip(new RegExp(`\\b(?:and\\s+|then\\s+)?(?:please\\s+)?(?:can\\s+you\\s+)?(?:add|put|pop|stick|save|throw|chuck)\\s+(?:it|this|that|them)\\s+(?:in|on|to|into|onto)\\s+(?:my|the)\\s+${CALENDAR_WORD}\\b`, "gi"));
  strip(new RegExp(`\\b(?:to|on|in|into|onto)\\s+(?:my|the)\\s+${CALENDAR_WORD}\\b`, "gi"));
  strip(/\b(?:please|pls|plz|for me|thanks|thank you|asap)\b/gi);
  strip(/^\s*(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:add|create|schedule|book|put|set\s+up|setup|plan|make|new|insert|log|enter|remember|note\s+down)\b(?:\s+(?:an?|my|the|in|another))?/i);
  strip(/^\s*(?:i\s+(?:have|got|need)\s+(?:an?\s+|my\s+|to\s+)?|i've\s+got\s+(?:an?\s+)?|i\s+will\s+have\s+(?:an?\s+)?|there(?:'s|\s+is)\s+(?:an?\s+)?|got\s+(?:an?\s+)?|we\s+have\s+(?:an?\s+)?|my\s+)/i);
  strip(/^\s*(?:an?|the)\s+/i);
  strip(/\b(?:event|appointment\s+for|reminder\s+for|entry)\s*$/i);
  strip(/\s+is\s+due\b|\bdue\b|\bdeadline\b(?:\s+for)?|\bdue\s+date\b/gi);
  t = t.replace(/\s+/g, " ").trim();
  // Dangling connectors left where dates/times were cut out.
  for (let i = 0; i < 4; i++) {
    t = t
      .replace(/^(?:and|on|at|for|from|by|to|the|,|-|–|:|with)\s+/i, "")
      .replace(/\s+(?:and|on|at|for|from|by|to|the|of|,|-|–|:|with|starting|until|till|is|it)$/i, "")
      .replace(/^[,.\-–:;!?\s]+|[,.\-–:;\s]+$/g, "")
      .trim();
  }
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

// ---------------------------------------------------------------------
// Segment parsing
// ---------------------------------------------------------------------

export function parseSegment(input: string, ctx: QuickAddContext): QuickAction | null {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const lower = text.toLowerCase();

  // Notes: "note: ...", "idea - ..."
  let m = /^(?:new\s+)?(?:note|notes|idea|jot(?:\s+down)?|write\s+down|save\s+(?:a\s+)?note)\s*(?:that\s+)?[:\-–—]?\s*([\s\S]+)$/i.exec(text);
  if (m) {
    const body = m[1].trim();
    const split = /^(.{1,60}?)\s*(?::|—|–| - |\n)\s*([\s\S]+)$/.exec(body);
    const title = split ? split[1] : body.split(/\s+/).slice(0, 7).join(" ") + (body.split(/\s+/).length > 7 ? "…" : "");
    return { kind: "note", title: cleanTitle(title) || "Quick note", content: split ? split[2].trim() : body };
  }

  // Journal: "journal: ...", "dear diary ..."
  m = /^(?:journal|diary|dear\s+diary|today\s+i\s+felt|journal\s+entry)\s*[:\-–—,]?\s*([\s\S]+)$/i.exec(text);
  if (m) return { kind: "journal", date: ctx.today, content: m[1].trim() };

  // Complete a to-do: "done buy milk", "mark call mom as done", "finished laundry"
  m = /^(?:done|did|finished|completed|complete|tick\s+off|check\s+off|cross\s+off|mark)\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|finished))?$/i.exec(text) ||
    /^(.+?)\s+(?:is\s+)?(?:done|complete|completed|finished)$/i.exec(text);
  if (m && ctx.openTodos.length) {
    const todo = bestTodoMatch(m[1], ctx.openTodos);
    if (todo) return { kind: "todo_complete", todoId: todo.id, title: todo.title };
  }

  // New habit: "new habit: drink 8 glasses of water", "track reading 20 pages daily"
  if (/\bhabits?\b/i.test(text) && /^(?:new|start|create|add|begin|build|make|track|set\s+up|i\s+want\s+to|habit\b)/i.test(lower)) {
    return parseHabitCreate(text);
  }
  if (/^track\s+/i.test(text) && !/\b(?:i|my)\b/i.test(text.slice(6, 10))) return parseHabitCreate(text);

  // Log an existing habit
  const habitLog = parseHabitLog(text, ctx);
  if (habitLog) return habitLog;

  // Everything else carries dates/times.
  const s = new Scanner(text);
  const todoPrefix = s.take(/^(?:(?:add\s+)?(?:a\s+)?(?:to-?do|todo|task\s+list|reminder)\s*(?:item)?\s*[:\-–—]?\s*(?:to\s+)?|add\s+to\s+(?:my\s+)?(?:to-?do(?:\s+list)?|list)\s*[:\-–—]?\s*|remind\s+me\s+to\s+|don'?t\s+(?:let\s+me\s+)?forget\s+to\s+|i\s+(?:need|have|must|gotta|should)\s+to\s+|i\s+gotta\s+|need\s+to\s+|have\s+to\s+|must\s+|gotta\s+)/);
  const recurrence = extractRecurrence(s);
  const dateHit = extractDate(s, ctx.today);
  const time = extractTime(s);
  const priority = extractPriority(s);
  const location = extractLocation(s);
  const rest = s.remaining();

  const hasSchedule = Boolean(dateHit || time.start || time.allDay || recurrence);
  const date = dateHit?.date ?? ctx.today;
  const startHint = time.start ?? dateHit?.timeHint ?? null;
  const deadlineWords = /\b(due|deadline|submit|submission|hand\s+in|hand-in)\b/i.test(lower);
  const byDate = /\bby\s+(?:tomorrow|tonight|today|the\s+\d|\d|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|end|next|this|midnight|noon)/i.test(lower);
  const workItem = /\b(project|assignment|essay|homework|hw|thesis|paper|report|pay|renew|apply|register|rsvp)\b/i.test(lower);
  const examWords = /\b(exam|test|quiz|midterm)\b/i.test(lower);

  let kind: "event" | "task" | "todo";
  if (todoPrefix) kind = time.explicit && !time.allDay ? "task" : "todo";
  else if (deadlineWords || (byDate && hasSchedule)) kind = "task";
  else if (workItem && dateHit && !time.end && !recurrence) kind = "task";
  else if (examWords && dateHit && !time.explicit) kind = "task";
  else if (hasSchedule) kind = "event";
  else kind = "todo";

  const title = cleanTitle(rest) || cleanTitle(text) || "Untitled";
  const category = inferCategory(text, ctx.categories);

  // "Buy flowers tomorrow" is an errand for that day, not an all-day event.
  if (kind === "event" && !startHint && !time.allDay && !recurrence && ERRAND_VERB.test(title)) kind = "todo";

  if (kind === "todo") return { kind: "todo", title, date: dateHit?.date ?? ctx.today };

  if (kind === "task") {
    return {
      kind: "task",
      title,
      date,
      dueTime: time.explicit ? (time.midnight ? "23:59" : time.start) : null,
      category,
      priority,
      notes: null,
    };
  }

  const startTime = time.allDay ? null : startHint;
  let endTime: string | null = null;
  if (startTime) {
    if (time.end && time.end > startTime) endTime = time.end;
    else endTime = addMinutes(startTime, time.durationMinutes ?? defaultDuration(text)).time;
    if (endTime <= startTime) endTime = "23:59";
  }
  let rec: Recurrence = "none";
  let recurrenceDays: string | null = null;
  let eventDate = date;
  if (recurrence) {
    rec = recurrence.recurrence;
    if (recurrence.days.length) {
      recurrenceDays = recurrence.days.join(",");
      // Start the series on the first matching day from the chosen date.
      if (!dateHit) eventDate = firstMatchingDay(ctx.today, recurrence.days);
    }
  }
  return {
    kind: "event",
    title,
    date: eventDate,
    startTime,
    endTime,
    endDate: null,
    location,
    category,
    priority,
    recurrence: rec,
    recurrenceDays,
    notes: null,
  };
}

function defaultDuration(text: string): number {
  if (/\b(party|wedding|concert|festival|braai|date night|movie|movies|hike|match|game)\b/i.test(text)) return 120;
  if (/\b(exam|final)\b/i.test(text)) return 180;
  if (EVENING_WORDS.test(text) && /\bdinner\b/i.test(text)) return 120;
  return 60;
}

function firstMatchingDay(today: string, days: number[]): string {
  const base = new Date(`${today}T00:00:00`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (days.includes(d.getDay())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return today;
}

function extractPriority(s: Scanner): "normal" | "high" | "urgent" {
  if (s.take(/\b(?:urgent(?:ly)?|asap|critical)\b|!!+/)) return "urgent";
  if (s.take(/\b(?:high\s+priority|important|priority)\b|!/)) return "high";
  return "normal";
}

// "at Nando's", "@ The Old Biscuit Mill" — capitalized words after at/@,
// never a time or a month/weekday.
function extractLocation(s: Scanner): string | null {
  const m = s.find(/(?:\bat|@)\s+((?:the\s+)?[A-Z][\w'’&.-]*(?:\s+(?:[A-Z][\w'’&.-]*|of|on|the|de|la))*)/);
  if (!m) return null;
  const place = m[1].replace(/\s+(?:of|on|the|de|la)$/i, "").trim();
  if (/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)(?:day)?|noon|midnight|night|home|work|lunch|dinner)$/i.test(place)) return null;
  // Lowercase-led text means the regex only matched because of the `i` flag
  // the Scanner adds — require a real capital.
  if (!/^[A-Z]/.test(s.original.slice(m.index + m[0].indexOf(m[1])).trim()) && !/^the\s+[A-Z]/i.test(m[1])) return null;
  s.consume(m);
  return s.original.slice(m.index, m.index + m[0].length).replace(/^\s*(?:at|@)\s+/i, "").trim();
}

function bestTodoMatch(phrase: string, todos: { id: string; title: string }[]) {
  const target = words(phrase);
  if (!target.length) return null;
  let best: { id: string; title: string } | null = null;
  let bestScore = 0;
  for (const t of todos) {
    const tw = words(t.title.replace(/\s*\(from [^)]*\)\s*$/i, ""));
    const hits = target.filter((w) => tw.some((x) => x === w || stem(x) === stem(w))).length;
    const score = hits / Math.max(target.length, tw.length);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

function parseHabitCreate(text: string): QuickAction {
  const s = new Scanner(text);
  s.take(/^(?:i\s+want\s+to\s+)?(?:(?:new|start|create|add|begin|build|make|set\s+up)\s+(?:a\s+)?(?:new\s+)?)?(?:daily\s+)?(?:habit\s*(?:of|to|for|called|named)?\s*[:\-–—]?\s*|track(?:ing)?\s+)/);
  s.take(/\b(?:as\s+a\s+|a\s+)?habit\b/);
  const rec = extractRecurrence(s);
  let target = 1;
  let unit: string | null = null;
  const tm = s.find(new RegExp(`\\b(\\d+)\\s*${UNIT_RE}\\b`));
  if (tm) {
    target = Math.max(1, Math.min(999, Number(tm[1])));
    unit = /^(x|times)$/i.test(tm[2]) ? null : tm[2].toLowerCase();
    // "drink 8 glasses of water" → name "Drink water", unit "glasses"
    s.consume(tm);
    s.take(/^\s*of\b|\s+of\s+(?=\w)/);
  } else {
    const xm = s.take(/\b(\d+)\s*(?:x|times)\s*(?:a|per)\s+day\b/);
    if (xm) target = Math.max(1, Math.min(999, Number(xm[1])));
  }
  s.take(/\b(?:a|per)\s+day\b/);
  // "10 push-ups every day" leaves nothing but the unit — name it after that.
  const name =
    cleanTitle(s.remaining().replace(/\s+of\s*$/i, "")) ||
    (unit ? cleanTitle(unit) : "") ||
    "New habit";
  const emoji = HABIT_EMOJI.find(([re]) => re.test(text))?.[1] ?? "✨";
  const color = HABIT_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HABIT_COLORS.length];
  return {
    kind: "habit_create",
    name,
    emoji,
    color,
    target,
    unit: target > 1 ? unit : null,
    days: rec && rec.days.length ? rec.days.join(",") : "",
  };
}

function parseHabitLog(text: string, ctx: QuickAddContext): QuickAction | null {
  if (!ctx.habits.length) return null;
  const verb = LOG_VERB.test(text);
  const scored = ctx.habits
    .map((h) => ({ h, score: habitMatchScore(text, h) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const { h, score } = scored[0];
  const num = /\b(\d+)\b/.exec(text.replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, ""));
  // Counting toward the habit, or naming it with a log verb, or the text is
  // essentially just the habit's name ("meditate").
  const nameOnly = words(text).length <= words(h.name).length + 1 && score >= 2;
  const unitMention = h.unit && num && new RegExp(`\\b${escapeRe(h.unit.replace(/s$/, ""))}`, "i").test(text);
  if (!(verb || unitMention || nameOnly)) return null;
  // Scheduling language means it's an event, not a log ("run tomorrow 6am").
  if (/\b(tomorrow|next|every|at\s+\d|\d\s*(am|pm)|on\s+(mon|tue|wed|thu|fri|sat|sun))/i.test(text)) return null;

  const s = new Scanner(text);
  const dateHit = extractDate(s, ctx.today, true);
  const amount = num && h.target > 1 ? Math.min(999, Number(num[1])) : h.target > 1 ? 1 : null;
  return {
    kind: "habit_log",
    habitId: h.id,
    habitName: h.name,
    date: dateHit && dateHit.date <= ctx.today ? dateHit.date : ctx.today,
    amount,
  };
}
