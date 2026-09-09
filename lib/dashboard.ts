import { prisma } from "@/lib/prisma";
import { addDaysToDateStr } from "@/lib/dates";
import { loadScheduleOccurrences } from "@/lib/calendar/scheduleRange";

// Windows the "Today" dashboard reads around the current date. Kept in
// sync with the same-named constants in app/page.tsx: far enough back to
// still surface overdue tasks, far enough forward for the "Upcoming"
// section.
const UPCOMING_WINDOW_DAYS = 14;
const OVERDUE_LOOKBACK_DAYS = 60;

// Everything the "Today" page needs, gathered server-side in one round
// trip. Replaces the old client-side fan-out (6 parallel fetches plus one
// /api/routines/:id/run per routine), which on a cold start each paid
// their own serverless + database wake penalty. Each individual field is
// still available from its own endpoint for the other pages.
export async function loadDashboardData(userId: string, today: string) {
  const from = addDaysToDateStr(today, -OVERDUE_LOOKBACK_DAYS);
  const to = addDaysToDateStr(today, UPCOMING_WINDOW_DAYS);

  const [reminders, events, todos, routines, me, journal] = await Promise.all([
    prisma.reminder.findMany({
      where: { userId, completed: false },
      orderBy: { dueAt: "asc" },
    }),
    loadScheduleOccurrences(userId, from, to),
    prisma.todo.findMany({
      where: { userId, date: today },
      orderBy: [{ completed: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.routine.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        todoReminderEnabled: true,
        todoReminderTime: true,
        todoReminderTimeZone: true,
      },
    }),
    // The journal card is non-essential chrome — never let a notebook
    // hiccup take the rest of the dashboard down with it.
    prisma.notebookEntry
      .findFirst({ where: { userId, journalDate: today } })
      .catch(() => null),
  ]);

  // One query for every routine's progress today, in place of the client
  // firing a request per routine (the old N+1).
  const routineIds = routines.map((r) => r.id);
  const runs = routineIds.length
    ? await prisma.routineRun.findMany({
        where: { routineId: { in: routineIds }, date: today },
      })
    : [];
  const routineDone: Record<string, number> = {};
  for (const run of runs) {
    routineDone[run.routineId] = run.completedStepIds
      ? run.completedStepIds.split(",").filter(Boolean).length
      : 0;
  }

  return { reminders, events, todos, routines, routineDone, me, journal };
}
