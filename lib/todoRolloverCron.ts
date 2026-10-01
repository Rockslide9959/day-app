import { prisma } from "@/lib/prisma";
import { resolveTimeZone, zonedTodayStr } from "@/lib/timezone";

export type TodoRolloverResult = { usersProcessed: number; todosMoved: number };

const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;

// "2026-09-08" -> "Sep 8". Used for the "(from ...)" suffix appended to a
// carried-over to-do's title — no timezone conversion needed since the date
// string is already the local wall date it was created for.
function formatRolloverLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Whether a client-supplied "today" could be a real local date somewhere on
// Earth right now (UTC-12 .. UTC+14). Guards the on-read rollover against a
// device with a wildly wrong clock dragging every open to-do into the future.
export function isPlausibleToday(dateStr: unknown, now: Date = new Date()): dateStr is string {
  if (typeof dateStr !== "string" || !DATE_STR_RE.test(dateStr)) return false;
  const earliest = zonedTodayStr("Etc/GMT+12", now);
  const latest = zonedTodayStr("Etc/GMT-14", now);
  return dateStr >= earliest && dateStr <= latest;
}

// Pulls every unfinished to-do sitting on a date before `today` forward onto
// `today`. The first time a given to-do gets carried forward, it's flagged
// (rolledOver) and its original date is remembered (rolledOverFromDate) so
// the UI can style it differently and its title gets a "(from ...)" suffix —
// both stay put across any further rolls of the same item, so re-rolling an
// item that's been open for a week doesn't pile up suffixes or move the
// displayed origin date. Idempotent: safe to call as often as you like.
export async function rolloverTodosForUser(userId: string, today: string): Promise<number> {
  const stale = await prisma.todo.findMany({
    where: { userId, completed: false, date: { lt: today } },
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

  return stale.length;
}

// On-read rollover: called by /api/todos and /api/dashboard with the
// client's own local date, so carry-over happens the moment the user opens
// the app — it no longer depends on the external cron firing (which has
// silently stalled more than once). Never throws: a rollover hiccup must
// not take the to-do list itself down with it.
export async function rolloverTodosOnRead(userId: string, today: unknown): Promise<void> {
  if (!isPlausibleToday(today)) return;
  try {
    await rolloverTodosForUser(userId, today);
  } catch (err) {
    console.error("todo rollover on read failed", { userId, err });
  }
}

// Cron backstop: once a day, per user, does the same rollover in the user's
// saved timezone (todoReminderTimeZone — the only zone captured
// server-side), so items are already moved before the app is even opened.
// Runs regardless of todoReminderEnabled (this isn't a notification).
// Dedupes via todoRolloverLastDate to keep each 20-min tick cheap; the
// on-read path above doesn't need that guard. One user's failure doesn't
// stop the others.
export async function processTodoRollover(now: Date): Promise<TodoRolloverResult> {
  const users = await prisma.user.findMany({
    select: { id: true, todoReminderTimeZone: true, todoRolloverLastDate: true },
  });

  const result: TodoRolloverResult = { usersProcessed: 0, todosMoved: 0 };

  for (const user of users) {
    const timeZone = resolveTimeZone(user.todoReminderTimeZone);
    const today = zonedTodayStr(timeZone, now);
    if (user.todoRolloverLastDate === today) continue;

    try {
      const moved = await rolloverTodosForUser(user.id, today);
      await prisma.user.update({
        where: { id: user.id },
        data: { todoRolloverLastDate: today },
      });
      result.usersProcessed++;
      result.todosMoved += moved;
    } catch (err) {
      console.error("cron tick: todo rollover failed for user", { userId: user.id, err });
    }
  }

  return result;
}
