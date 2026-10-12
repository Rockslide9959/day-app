import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { todayStr } from "@/lib/dates";
import { isValidDateStr } from "@/lib/validation";
import { parseHabitInput } from "@/lib/habits";
import { loadHabits } from "@/lib/habitsData";

export const dynamic = "force-dynamic";

// `date` is the client's local calendar date, which bounds the log window
// — same contract as /api/dashboard. `archived=1` includes archived habits.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") || todayStr();
  if (!isValidDateStr(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const includeArchived = req.nextUrl.searchParams.get("archived") === "1";
  return NextResponse.json(await loadHabits(userId, date, { includeArchived }));
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseHabitInput(await req.json().catch(() => null), false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const count = await prisma.habit.count({ where: { userId } });
  const habit = await prisma.habit.create({
    data: { ...parsed.data, name: parsed.data.name!, userId, sortOrder: parsed.data.sortOrder ?? count },
  });
  return NextResponse.json(habit, { status: 201 });
}
