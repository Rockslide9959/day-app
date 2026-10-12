import { prisma } from "@/lib/prisma";
import { addDaysToDateStr, dateToDateStr } from "@/lib/dates";
import { HABIT_HISTORY_DAYS, HabitWithLogs } from "@/lib/habits";

type HabitRow = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  target: number;
  unit: string | null;
  days: string;
  archived: boolean;
  createdAt: Date;
  logs: { date: string; count: number }[];
};

function toHabitWithLogs(row: HabitRow): HabitWithLogs {
  const logs: Record<string, number> = {};
  for (const log of row.logs) if (log.count > 0) logs[log.date] = log.count;
  // createdAt is a server timestamp, so its calendar date can be a day off
  // the user's local one — the earliest log (always a local date) wins
  // when it's earlier, which covers backfilled days too.
  const created = dateToDateStr(row.createdAt);
  const earliestLog = row.logs.reduce<string | null>((min, l) => (!min || l.date < min ? l.date : min), null);
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    target: row.target,
    unit: row.unit,
    days: row.days,
    archived: row.archived,
    startDate: earliestLog && earliestLog < created ? earliestLog : created,
    logs,
  };
}

function logWindow(today: string) {
  return {
    where: { date: { gte: addDaysToDateStr(today, -HABIT_HISTORY_DAYS), lte: today }, count: { gt: 0 } },
    select: { date: true, count: true },
  };
}

export async function loadHabits(
  userId: string,
  today: string,
  { includeArchived = false } = {}
): Promise<HabitWithLogs[]> {
  const rows = await prisma.habit.findMany({
    where: { userId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { logs: logWindow(today) },
  });
  return rows.map(toHabitWithLogs);
}

export async function loadHabit(userId: string, id: string, today: string): Promise<HabitWithLogs | null> {
  const row = await prisma.habit.findFirst({
    where: { id, userId },
    include: { logs: logWindow(today) },
  });
  return row ? toHabitWithLogs(row) : null;
}
