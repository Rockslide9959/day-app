import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/dates";
import { expandEventOccurrences } from "@/lib/calendar/recurrence";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (from && to) {
    // Every row that COULD produce an occurrence somewhere in [from, to]:
    // either a plain event overlapping the range, or a recurring series
    // that starts before `to` and (if bounded) doesn't end before `from`.
    const items = await prisma.scheduleItem.findMany({
      where: {
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
    where: { date },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title,
    notes,
    date,
    startTime,
    endTime,
    endDate,
    allDay,
    location,
    category,
    reminderMinutesBefore,
    priority,
    recurrence,
    recurrenceDays,
    recurrenceEndDate,
    subject,
    estimatedHours,
  } = body;
  if (!title || !startTime || !endTime) {
    return NextResponse.json(
      { error: "title, startTime and endTime are required" },
      { status: 400 }
    );
  }
  const item = await prisma.scheduleItem.create({
    data: {
      title,
      notes: notes || null,
      date: date || todayStr(),
      startTime,
      endTime,
      endDate: endDate || null,
      allDay: Boolean(allDay),
      location: location || null,
      category: category || null,
      reminderMinutesBefore:
        typeof reminderMinutesBefore === "number" ? reminderMinutesBefore : null,
      priority: priority || "normal",
      recurrence: recurrence || "none",
      recurrenceDays: recurrenceDays || null,
      recurrenceEndDate: recurrenceEndDate || null,
      subject: subject || null,
      estimatedHours: typeof estimatedHours === "number" ? estimatedHours : null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
