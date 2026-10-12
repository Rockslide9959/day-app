import { prisma } from "@/lib/prisma";
import { addDaysToDateStr } from "@/lib/dates";
import { loadScheduleOccurrences } from "@/lib/calendar/scheduleRange";
import { loadHabits } from "@/lib/habitsData";

// Windows the "Today" dashboard reads around the current date. Kept in
// sync with the same-named constants in app/page.tsx: far enough back to
// still surface overdue tasks, far enough forward for the "Upcoming"
// section.
const UPCOMING_WINDOW_DAYS = 14;
const OVERDUE_LOOKBACK_DAYS = 60;

// Everything the "Today" page needs, gathered server-side in one round
// trip. Replaces the old client-side fan-out of parallel fetches, which on
// a cold start each paid their own serverless + database wake penalty.
// Each individual field is still available from its own endpoint for the
// other pages.
export async function loadDashboardData(userId: string, today: string) {
  const from = addDaysToDateStr(today, -OVERDUE_LOOKBACK_DAYS);
  const to = addDaysToDateStr(today, UPCOMING_WINDOW_DAYS);

  const [events, todos, habits, me, journal] = await Promise.all([
    loadScheduleOccurrences(userId, from, to),
    prisma.todo.findMany({
      where: { userId, date: today },
      orderBy: [{ completed: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    loadHabits(userId, today),
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

  return { events, todos, habits, me, journal };
}
