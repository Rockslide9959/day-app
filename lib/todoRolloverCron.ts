import { prisma } from "@/lib/prisma";
import { resolveTimeZone, zonedTodayStr } from "@/lib/timezone";

export type TodoRolloverResult = { usersProcessed: number; todosMoved: number };

// Once a day, per user, any to-do still sitting on a past date and not
// completed gets pulled forward onto today — so an unfinished item shows up
// on the current day's list instead of silently sitting on a date the user
// no longer looks at. Runs regardless of todoReminderEnabled (this isn't a
// notification), reusing todoReminderTimeZone as the per-user zone since
// that's the only one captured server-side today. Dedupes the same way
// processTodoReminders does — keyed off todoRolloverLastDate rather than a
// per-item delivery table.
export async function processTodoRollover(now: Date): Promise<TodoRolloverResult> {
  const users = await prisma.user.findMany({
    select: { id: true, todoReminderTimeZone: true, todoRolloverLastDate: true },
  });

  const result: TodoRolloverResult = { usersProcessed: 0, todosMoved: 0 };

  for (const user of users) {
    const timeZone = resolveTimeZone(user.todoReminderTimeZone);
    const today = zonedTodayStr(timeZone, now);
    if (user.todoRolloverLastDate === today) continue;

    const { count } = await prisma.todo.updateMany({
      where: { userId: user.id, completed: false, date: { lt: today } },
      data: { date: today },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { todoRolloverLastDate: today },
    });

    result.usersProcessed++;
    result.todosMoved += count;
  }

  return result;
}
