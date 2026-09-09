import { prisma } from "@/lib/prisma";
import { expandEventOccurrences } from "@/lib/calendar/recurrence";

// Single source of truth for "every schedule occurrence in [from, to]",
// shared by GET /api/schedule?from&to and the dashboard aggregate
// (lib/dashboard.ts) so both select and expand the exact same rows the
// same way. Returns occurrences sorted by (date, startTime).
export async function loadScheduleOccurrences(userId: string, from: string, to: string) {
  // Every row that COULD produce an occurrence somewhere in [from, to]:
  // either a plain event overlapping the range, or a recurring series
  // that starts before `to` and (if bounded) doesn't end before `from`.
  const items = await prisma.scheduleItem.findMany({
    where: {
      userId,
      OR: [
        {
          recurrence: "none",
          date: { lte: to },
          OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }],
        },
        {
          NOT: { recurrence: "none" },
          date: { lte: to },
          OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: from } }],
        },
      ],
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const range = { from, to };
  const occurrences = items.flatMap((item) => expandEventOccurrences(item, range));
  occurrences.sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
  );
  return occurrences;
}
