import { NextRequest, NextResponse } from "next/server";
import { processTodoReminders } from "@/lib/todoReminderCron";
import { processTodoRollover } from "@/lib/todoRolloverCron";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleTick(req);
}
export async function POST(req: NextRequest) {
  return handleTick(req);
}

// Runs one phase of the tick in isolation. A transient DB/network hiccup in
// one phase — most commonly a reconnect stall while Neon's free-tier compute
// wakes from idle — must not throw away every other phase in the same tick
// (that's how a single flaky push used to also skip todo rollover and
// everything after it). Each phase gets its own try/catch and falls back to
// a zeroed result, and the overall response only 500s if every phase
// failed — a genuine outage, not a one-off blip — so cron-job.org doesn't
// flag isolated hiccups as failed runs.
async function runPhase<T>(name: string, fallback: T, errors: string[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`cron tick: ${name} phase failed`, err);
    errors.push(name);
    return fallback;
  }
}

async function handleTick(req: NextRequest) {
  const secret = (req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const errors: string[] = [];

  // Runs first, in its own phase: this is the thing that used to silently
  // starve whenever a later phase threw, since it ran dead last.
  const todoRollover = await runPhase(
    "todoRollover",
    { usersProcessed: 0, todosMoved: 0 },
    errors,
    () => processTodoRollover(now)
  );
  const todoReminders = await runPhase(
    "todoReminders",
    { due: 0, sent: 0 },
    errors,
    () => processTodoReminders(now)
  );

  const totalPhases = 2;
  const status = errors.length >= totalPhases ? 500 : 200;

  return NextResponse.json(
    {
      todoRolloverUsers: todoRollover.usersProcessed,
      todoRolloverMoved: todoRollover.todosMoved,
      todoRemindersDue: todoReminders.due,
      todoRemindersSent: todoReminders.sent,
      ...(errors.length ? { errors } : {}),
    },
    { status }
  );
}
