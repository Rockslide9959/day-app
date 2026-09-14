import { prisma } from "@/lib/prisma";
import { resolveTimeZone, zonedTodayStr } from "@/lib/timezone";

export type TodoRolloverResult = { usersProcessed: number; todosMoved: number };

// "2026-09-08" -> "Sep 8". Used for the "(from ...)" suffix appended to a
// carried-over to-do's title — no timezone conversion needed since the date
// string is already the local wall date it was created for.
function formatRolloverLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Once a day, per user, any to-do still sitting on a past date and not
// completed gets pulled forward onto today — so an unfinished item shows up
// on the current day's list instead of silently sitting on a date the user
// no longer looks at. The first time a given to-do gets carried forward, it's
// flagged (rolledOver) and its original date is remembered
// (rolledOverFromDate) so the UI can style it differently and its title gets
// a "(from ...)" suffix appended — both stay put across any further rolls of
// the same item, so re-rolling an item that's been open for a week doesn't
// pile up suffixes or move the displayed origin date. Runs regardless of
// todoReminderEnabled (this isn't a notification), reusing
// todoReminderTimeZone as the per-user zone since that's the only one
// captured server-side today. Dedupes the same way processTodoReminders
// does — keyed off todoRolloverLastDate rather than a per-item delivery
// table.
export async function processTodoRollover(now: Date): Promise<TodoRolloverResult> {
  const users = await prisma.user.findMany({
    select: { id: true, todoReminderTimeZone: true, todoRolloverLastDate: true },
  });

  const result: TodoRolloverResult = { usersProcessed: 0, todosMoved: 0 };

  for (const user of users) {
    const timeZone = resolveTimeZone(user.todoReminderTimeZone);
    const today = zonedTodayStr(timeZone, now);
    if (user.todoRolloverLastDate === today) continue;

    const stale = await prisma.todo.findMany({
      where: { userId: user.id, completed: false, date: { lt: today } },
      select: { id: true, title: true, date: true, rolledOverFromDate: true },
    });

    for (const todo of stale) {
      const fromDate = todo.rolledOverFromDate ?? todo.date;
      const alreadyFlagged = todo.rolledOverFromDate != null;
      await prisma.todo.update({
        where: { id: todo.id },
        data: {
          date: today,
          rolledOver: true,
          rolledOverFromDate: fromDate,
          title: alreadyFlagged ? todo.title : `${todo.title} (from ${formatRolloverLabel(fromDate)})`,
        },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { todoRolloverLastDate: today },
    });

    result.usersProcessed++;
    result.todosMoved += stale.length;
  }

  return result;
}
