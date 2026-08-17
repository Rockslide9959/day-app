import { prisma } from "@/lib/prisma";
import { sendPush, isPushConfigured } from "@/lib/webpush";
import { resolveTimeZone, zonedTodayStr, zonedTimeToUtc } from "@/lib/timezone";

export type TodoReminderResult = { due: number; sent: number };

const EMPTY_RESULT: TodoReminderResult = { due: 0, sent: 0 };

// Once-a-day "you still have unfinished to-dos" nudge. Unlike the
// Reminder/ScheduleItem sweeps in reminderCron.ts, this isn't tied to any
// one row's own dueAt — it's keyed off each user's todoReminderTime
// setting, so every tick scans reminder-enabled users and self-dedupes via
// todoReminderLastSentDate rather than a per-occurrence delivery table
// (there's only ever one of these a day, so that table would be overkill).
export async function processTodoReminders(now: Date): Promise<TodoReminderResult> {
  if (!isPushConfigured()) return EMPTY_RESULT;

  const users = await prisma.user.findMany({
    where: { todoReminderEnabled: true },
    select: {
      id: true,
      todoReminderTime: true,
      todoReminderTimeZone: true,
      todoReminderLastSentDate: true,
    },
  });

  const result: TodoReminderResult = { due: 0, sent: 0 };

  for (const user of users) {
    const timeZone = resolveTimeZone(user.todoReminderTimeZone);
    const today = zonedTodayStr(timeZone, now);
    if (user.todoReminderLastSentDate === today) continue;

    const reminderAt = zonedTimeToUtc(today, user.todoReminderTime, timeZone);
    if (now.getTime() < reminderAt.getTime()) continue;

    result.due++;
    // Claimed up front (regardless of whether anything's actually left to
    // remind about) so a user with nothing outstanding isn't re-queried on
    // every tick for the rest of the day.
    await prisma.user.update({
      where: { id: user.id },
      data: { todoReminderLastSentDate: today },
    });

    const openTodos = await prisma.todo.count({
      where: { userId: user.id, date: today, completed: false },
    });
    if (openTodos === 0) continue;

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    const body =
      openTodos === 1 ? "You still have 1 to-do left today." : `You still have ${openTodos} to-dos left today.`;

    for (const sub of subscriptions) {
      try {
        await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          { title: "Wrap up your day", body, url: "/" }
        );
        result.sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  }

  return result;
}
