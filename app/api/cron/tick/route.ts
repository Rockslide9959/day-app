import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush, isPushConfigured } from "@/lib/webpush";
import { nextOccurrence } from "@/lib/recurrence";
import { autoTransitionData } from "@/lib/timers";
import { processScheduleReminders } from "@/lib/calendar/reminderCron";

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
      }
    }
  }
  return sent;
}

async function handleTick(req: NextRequest) {
  const secret = (req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: { notified: false, completed: false, dueAt: { lte: now } },
  });

  let sent = 0;
  for (const reminder of due) {
    sent += await pushToUser(reminder.userId, {
      title: reminder.title,
      body: reminder.notes || "Reminder",
      url: "/reminders",
    });

    const next = nextOccurrence(reminder.dueAt, reminder.recurrence);
    if (next) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { dueAt: next, notified: false },
      });
    } else {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { notified: true },
      });
    }
  }

  // Timers: a stopwatch never has a phaseDuration so autoTransitionData
  // always no-ops for it — only countdown/pomodoro rows still "running"
  // are worth reading here.
  const runningTimers = await prisma.timer.findMany({
    where: { status: "running", mode: { in: ["countdown", "pomodoro"] } },
  });

  let timersSent = 0;
  let timersTransitioned = 0;
  for (const timer of runningTimers) {
    const transition = autoTransitionData(timer, now);
    if (!transition) continue;
    timersTransitioned++;

    const finishedWork = timer.mode === "pomodoro" && timer.phase !== "break";
    const payload =
      timer.mode === "countdown"
        ? { title: "Timer finished", body: timer.label, url: "/timers" }
        : finishedWork
          ? { title: "Work session done", body: `Take a break — ${timer.label}`, url: "/timers" }
          : { title: "Break's over", body: `Back to work — ${timer.label}`, url: "/timers" };

    timersSent += await pushToUser(timer.userId, payload);
    await prisma.timer.update({ where: { id: timer.id }, data: transition });
  }

  const schedule = await processScheduleReminders(now);

  return NextResponse.json({
    sent,
    reminders: due.length,
    timersSent,
    timersTransitioned,
    scheduleRemindersDue: schedule.due,
    schedulePushesSent: schedule.sent,
    scheduleRetries: schedule.retries,
    scheduleSkippedCompleted: schedule.skippedCompleted,
  });
}
