import Anthropic from "@anthropic-ai/sdk";
import { normalizeActions, type RawAction } from "./normalize";
import type { QuickAction, QuickAddContext } from "./types";

// Claude-backed Quick Add interpreter. Only used when ANTHROPIC_API_KEY is
// configured; the route falls back to the offline parser (parse.ts) when
// it isn't, or when a call fails, so Quick Add always works.

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = "claude-opus-5-5";

const nullableString = { type: ["string", "null"] };
const nullableInt = { type: ["integer", "null"] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["actions", "message"],
  properties: {
    message: { ...nullableString, description: "Only when nothing could be done: a short note asking for what's missing." },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind", "title", "date", "start_time", "end_time", "end_date", "due_time", "location", "category",
          "priority", "recurrence", "recurrence_days", "notes", "todo_id", "habit_id", "amount", "habit_emoji",
          "habit_target", "habit_unit", "habit_days", "content",
        ],
        properties: {
          kind: { type: "string", enum: ["event", "task", "todo", "todo_complete", "habit_create", "habit_log", "note", "journal"] },
          title: nullableString,
          date: nullableString,
          start_time: nullableString,
          end_time: nullableString,
          end_date: nullableString,
          due_time: nullableString,
          location: nullableString,
          category: nullableString,
          priority: { type: "string", enum: ["normal", "high", "urgent"] },
          recurrence: { type: "string", enum: ["none", "daily", "weekly", "weekdays", "monthly", "custom"] },
          recurrence_days: nullableString,
          notes: nullableString,
          todo_id: nullableString,
          habit_id: nullableString,
          amount: nullableInt,
          habit_emoji: nullableString,
          habit_target: nullableInt,
          habit_unit: nullableString,
          habit_days: nullableString,
          content: nullableString,
        },
      },
    },
  },
} as const;

// Frozen so it stays byte-identical across requests (prompt caching);
// everything per-request lives in the user message.
const SYSTEM = `You turn one quick line typed into "Day", a personal planner app, into concrete actions. The user may ask for several things at once; return one action per thing. Never invent things they didn't ask for.

Action kinds and the fields each uses (set every unused field to null; priority "normal" and recurrence "none" unless stated):
- event: something that happens at a time/day — title, date, start_time, end_time (or null for all-day), end_date (multi-day only), location, category, priority, recurrence, recurrence_days, notes.
- task: a deadline / something due — title, date (due date), due_time (null if no time), category, priority, notes. Use for anything "due", "deadline", "submit", "hand in", assignments, projects, bills to pay by a date.
- todo: a simple thing to do on a day with no specific time — title, date (default today).
- todo_complete: mark one of the user's open to-dos done — todo_id (must be one of the provided ids).
- habit_create: start tracking a new habit — title (short habit name like "Drink water"), habit_emoji (one fitting emoji), habit_target (units per day; 1 for a yes/no habit), habit_unit (e.g. "glasses", null when target is 1), habit_days (comma-separated weekdays 0=Sun..6=Sat, null = every day).
- habit_log: record progress on one of the user's existing habits — habit_id (must be one of the provided ids), date (default today; never future), amount (units to add, or null to mark it fully done).
- note: save a note — title (short), content (the full text).
- journal: add to the day's journal entry — date, content (their words, lightly cleaned up).

Rules:
- Dates are YYYY-MM-DD, times are 24-hour HH:MM, resolved against the provided "today" in the user's timezone. Bare dates/weekdays mean the next upcoming one (today counts) unless context says past (logging, journaling).
- "midnight" as a deadline means 23:59 on that date. "noon" is 12:00. Times without am/pm: 1–6 are pm; 7–11 are pm for evening plans (dinner, date, party, drinks, movie), otherwise am.
- Events with a start but no end: default 1 hour (2 hours for parties, date nights, concerts, movies; 3 for exams).
- recurrence: "daily", "weekdays" (Mon–Fri), "weekly" (same weekday as date; or set recurrence_days for one weekday), "custom" with recurrence_days for several weekdays like Mon & Wed = "1,3", "monthly". The event date should be the first occurrence.
- category must be one of the provided categories or null. Pick the best fit (e.g. date night → Social, gym → Exercise, essay due → Assignment, dentist → Appointment).
- Titles are short and natural, capitalized, without filler like "add", "my calendar", dates or times ("i have a project due nov 9" → "Project").
- Prefer logging an existing habit over creating a todo when the text describes doing that habit ("drank 2 glasses" → habit_log with amount 2).
- If the request is impossible to act on, return no actions and a brief message.`;

export async function interpretWithAi(text: string, ctx: QuickAddContext): Promise<{ actions: QuickAction[]; message: string | null }> {
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  const weekday = new Date(`${ctx.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  const now = `${String(Math.floor(ctx.nowMinutes / 60)).padStart(2, "0")}:${String(ctx.nowMinutes % 60).padStart(2, "0")}`;
  const context = {
    today: `${ctx.today} (${weekday})`,
    current_time: now,
    timezone: ctx.timeZone,
    categories: ctx.categories,
    habits: ctx.habits.map((h) => ({ id: h.id, name: h.name, daily_target: h.target, unit: h.unit })),
    open_todos_today: ctx.openTodos.map((t) => ({ id: t.id, title: t.title })),
  };

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: `<context>\n${JSON.stringify(context, null, 1)}\n</context>\n\n<request>\n${text}\n</request>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("AI declined the request");
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("AI returned no output");
  const parsed = JSON.parse(textBlock.text) as { actions?: RawAction[]; message?: string | null };
  return {
    actions: normalizeActions(Array.isArray(parsed.actions) ? parsed.actions : [], ctx),
    message: typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim().slice(0, 300) : null,
  };
}
