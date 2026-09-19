import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush, isPushConfigured } from "@/lib/webpush";
import { nextOccurrence } from "@/lib/recurrence";
import { autoTransitionData } from "@/lib/timers";
import { processScheduleReminders } from "@/lib/calendar/reminderCron";
import { processTodoReminders } from "@/lib/todoReminderCron";
import { processTodoRollover } from "@/lib/todoRolloverCron";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleTick(req);
}
export async function POST(req: NextRequest) {
  return handleTick(req);
}

// Pushes to every device a given user has subscribed on — each caller
// (reminders, timers) only ever notifies its own owner's devices, since
// this serves multiple accounts and there's no single global subscription
// list. Prunes subscriptions the push service reports as gone.
async function pushToUser(userId: string, payload: { title: string; body?: string; url?: string }) {
  if (!isPushConfigured()) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error("push send failed", { userId, statusCode, body: (err as { body?: string })?.body, message: (err as Error)?.message });
      }
    }
  }
  return sent;
}

// Runs one phase of the tick in isolation. A transient DB/network hiccup in
// one phase — most commonly a reconnect stall while Neon's free-tier compute
// wakes from idle — must not throw away every other phase in the same tick
// (that's how a single flaky reminder push used to also skip todo rollover
// and everything after it). Each phase gets its own try/catch and falls back
// to a zeroed result, and the overall response only 500s if every phase
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

  const { sent, dueCount } = await runPhase(
    "reminders",
    { sent: 0, dueCount: 0 },
    errors,
    async () => {
      const due = await prisma.reminder.findMany({
        where: { notified: false, completed: false, dueAt: { lte: now } },
      });

      let sentCount = 0;
      for (const reminder of due) {
        try {
          sentCount += await pushToUser(reminder.userId, {
            title: reminder.title,
            body: reminder.notes || "Reminder",
            url: "/reminders",
          });

          const next = nextOccurrence(reminder.dueAt, reminder.recurrence);
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: next ? { dueAt: next, notified: false } : { notified: true },
          });
        } catch (err) {
          console.error("cron tick: reminder failed", { reminderId: reminder.id, err });
        }
      }
      return { sent: sentCount, dueCount: due.length };
    }
  );

  // Timers: a stopwatch never has a phaseDuration so autoTransitionData
  // always no-ops for it — only countdown/pomodoro rows still "running"
  // are worth reading here.
  const { timersSent, timersTransitioned } = await runPhase(
    "timers",
    { timersSent: 0, timersTransitioned: 0 },
    errors,
    async () => {
      const runningTimers = await prisma.timer.findMany({
        where: { status: "running", mode: { in: ["countdown", "pomodoro"] } },
      });

      let sentCount = 0;
      let transitionedCount = 0;
      for (const timer of runningTimers) {
        try {
          const transition = autoTransitionData(timer, now);
          if (!transition) continue;
          transitionedCount++;

          const finishedWork = timer.mode === "pomodoro" && timer.phase !== "break";
          const payload =
            timer.mode === "countdown"
              ? { title: "Timer finished", body: timer.label, url: "/timers" }
              : finishedWork
                ? { title: "Work session done", body: `Take a break — ${timer.label}`, url: "/timers" }
                : { title: "Break's over", body: `Back to work — ${timer.label}`, url: "/timers" };

          sentCount += await pushToUser(timer.userId, payload);
          await prisma.timer.update({ where: { id: timer.id }, data: transition });
        } catch (err) {
          console.error("cron tick: timer failed", { timerId: timer.id, err });
        }
      }
      return { timersSent: sentCount, timersTransitioned: transitionedCount };
    }
  );

  const schedule = await runPhase(
    "schedule",
    { due: 0, sent: 0, retries: 0, skippedCompleted: 0 },
    errors,
    () => processScheduleReminders(now)
  );
  const todoReminders = await runPhase(
    "todoReminders",
    { due: 0, sent: 0 },
    errors,
    () => processTodoReminders(now)
  );

  const totalPhases = 5;
  const status = errors.length >= totalPhases ? 500 : 200;

  return NextResponse.json(
    {
      sent,
      reminders: dueCount,
      timersSent,
      timersTransitioned,
      scheduleRemindersDue: schedule.due,
      schedulePushesSent: schedule.sent,
      scheduleRetries: schedule.retries,
      scheduleSkippedCompleted: schedule.skippedCompleted,
      todoRolloverUsers: todoRollover.usersProcessed,
      todoRolloverMoved: todoRollover.todosMoved,
      todoRemindersDue: todoReminders.due,
      todoRemindersSent: todoReminders.sent,
      ...(errors.length ? { errors } : {}),
    },
    { status }
  );
}
