import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { todayStr } from "@/lib/dates";
import { isValidDateStr } from "@/lib/validation";
import { isValidTimeZone } from "@/lib/timezone";
import { parseQuickAdd } from "@/lib/quickAdd/parse";
import { interpretWithAi, isAiEnabled } from "@/lib/quickAdd/ai";
import { executeActions, loadQuickAddContext } from "@/lib/quickAdd/execute";
import type { QuickAction } from "@/lib/quickAdd/types";

export const dynamic = "force-dynamic";
// Leaves room for the AI call (which has its own 25s timeout) on top of the
// database work.
export const maxDuration = 60;

const MAX_TEXT = 2000;

function readClock(params: { today?: unknown; nowMinutes?: unknown; timeZone?: unknown }) {
  const today = isValidDateStr(params.today) ? params.today : todayStr();
  const n = Number(params.nowMinutes);
  const nowMinutes = Number.isInteger(n) && n >= 0 && n < 1440 ? n : 12 * 60;
  const timeZone = typeof params.timeZone === "string" && isValidTimeZone(params.timeZone) ? params.timeZone : "Africa/Johannesburg";
  return { today, nowMinutes, timeZone };
}

// What the client needs for its instant, offline preview while typing.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const clock = readClock({ today: p.get("today"), nowMinutes: p.get("nowMinutes"), timeZone: p.get("timeZone") });
  const ctx = await loadQuickAddContext(userId, clock.today, clock.nowMinutes, clock.timeZone);
  return NextResponse.json({ ai: isAiEnabled(), context: ctx });
}

// Interprets the text (Claude when configured, otherwise the rule-based
// parser — and the parser again if the AI call fails) and carries it out.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Type something to add" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: `Keep it under ${MAX_TEXT} characters` }, { status: 400 });

  const clock = readClock(body);
  const ctx = await loadQuickAddContext(userId, clock.today, clock.nowMinutes, clock.timeZone);

  let actions: QuickAction[] = [];
  let message: string | null = null;
  let engine: "ai" | "rules" = "rules";
  if (isAiEnabled()) {
    try {
      ({ actions, message } = await interpretWithAi(text, ctx));
      engine = "ai";
    } catch (err) {
      console.error("quick-add: AI interpretation failed, using rules", err);
    }
  }
  if (engine === "rules") actions = parseQuickAdd(text, ctx);

  if (actions.length === 0) {
    return NextResponse.json({
      engine,
      results: [],
      message: message ?? "I couldn't work out what to add. Try something like “Dentist Friday at 10am”.",
    });
  }

  const results = await executeActions(userId, actions, ctx);
  return NextResponse.json({ engine, results, message: null });
}
