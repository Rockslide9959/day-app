import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { isValidDateStr } from "@/lib/validation";
import { MAX_HABIT_COUNT } from "@/lib/habits";

export const dynamic = "force-dynamic";

// Sets (not increments) a habit's count for one local day, so a retried or
// duplicated request lands on the same value. `today` is the client's local
// date — logging is allowed for today and any past day (backfilling a
// forgotten check-in from the heatmap), never the future.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const { date, count, today } = (body ?? {}) as Record<string, unknown>;
  if (!isValidDateStr(date) || !isValidDateStr(today)) {
    return NextResponse.json({ error: "date and today must be YYYY-MM-DD" }, { status: 400 });
  }
  if (date > today) {
    return NextResponse.json({ error: "Can't log a future day" }, { status: 400 });
  }
  if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > MAX_HABIT_COUNT) {
    return NextResponse.json({ error: `count must be a whole number from 0 to ${MAX_HABIT_COUNT}` }, { status: 400 });
  }

  const habit = await prisma.habit.findFirst({ where: { id, userId }, select: { id: true } });
  if (!habit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (count === 0) {
    await prisma.habitLog.deleteMany({ where: { habitId: id, date } });
  } else {
    await prisma.habitLog.upsert({
      where: { habitId_date: { habitId: id, date } },
      create: { habitId: id, date, count: count as number },
      update: { count: count as number },
    });
  }
  return NextResponse.json({ date, count });
}
