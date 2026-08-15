import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/dates";
import { expandEventOccurrences } from "@/lib/calendar/recurrence";
import { getCurrentUserId } from "@/lib/auth";
import { validateItemType } from "@/lib/validation";
import { resolveTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (from && to) {
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
    return NextResponse.json(occurrences);
  }

  const date = req.nextUrl.searchParams.get("date") || todayStr();
  const items = await prisma.scheduleItem.findMany({
    where: { userId, date },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const itemTypeError = validateItemType(body.itemType);
  if (itemTypeError) return NextResponse.json({ error: itemTypeError }, { status: 400 });
  const itemType = body.itemType === "task" ? "task" : "event";

  const {
    title,
    notes,
    date,
    category,
    reminderMinutesBefore,
    priority,
    recurrence,
    recurrenceDays,
    recurrenceEndDate,
    subject,
    estimatedHours,
  } = body;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Tasks are re-derived server-side (not trusted from the client) so an
  // event-shaped payload can never produce an inconsistent task record: a
  // task is always single-day (endDate == date) and either has a specific
  // due time or is allDay with the standard safe internal times.
  let startTime: string;
  let endTime: string;
  let endDate: string | null;
  let allDay: boolean;
  let location: string | null;

  if (itemType === "task") {
    if (!date) {
      return NextResponse.json({ error: "date (due date) is required" }, { status: 400 });
    }
    const dueTime = typeof body.startTime === "string" ? body.startTime : "";
    if (dueTime) {
      startTime = dueTime;
      endTime = dueTime;
      allDay = false;
    } else {
      startTime = "00:00";
      endTime = "23:59";
      allDay = true;
    }
    endDate = date;
    location = null;
  } else {
    if (!body.startTime || !body.endTime) {
      return NextResponse.json(
        { error: "title, startTime and endTime are required" },
        { status: 400 }
      );
    }
    startTime = body.startTime;
    endTime = body.endTime;
    allDay = Boolean(body.allDay);
    endDate = body.endDate || null;
    location = body.location || null;
  }

  const item = await prisma.scheduleItem.create({
    data: {
      userId,
      itemType,
      title,
      notes: notes || null,
      date: date || todayStr(),
      startTime,
      endTime,
      endDate,
      allDay,
      location,
      category: category || null,
      reminderMinutesBefore:
        typeof reminderMinutesBefore === "number" ? reminderMinutesBefore : null,
      priority: priority || "normal",
      recurrence: recurrence || "none",
      recurrenceDays: recurrenceDays || null,
      recurrenceEndDate: recurrenceEndDate || null,
      subject: subject || null,
      estimatedHours: typeof estimatedHours === "number" ? estimatedHours : null,
      timeZone: resolveTimeZone(body.timeZone),
    },
  });

  return NextResponse.json(item, { status: 201 });
}
