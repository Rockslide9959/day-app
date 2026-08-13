import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // Toggling completion for one occurrence of a recurring event is a
  // separate, narrower operation from editing the series itself — it
  // only ever touches completedDates, never the other fields.
  if (typeof body.toggleCompletedDate === "string") {
    const current = await prisma.scheduleItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const dates = new Set(current.completedDates.split(",").filter(Boolean));
    if (dates.has(body.toggleCompletedDate)) dates.delete(body.toggleCompletedDate);
    else dates.add(body.toggleCompletedDate);
    const item = await prisma.scheduleItem.update({
      where: { id },
      data: { completedDates: [...dates].sort().join(",") },
    });
    return NextResponse.json(item);
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.notes === "string" || body.notes === null) data.notes = body.notes;
  if (typeof body.date === "string") data.date = body.date;
  if (typeof body.startTime === "string") data.startTime = body.startTime;
  if (typeof body.endTime === "string") data.endTime = body.endTime;
  if (typeof body.endDate === "string" || body.endDate === null) data.endDate = body.endDate;
  if (typeof body.allDay === "boolean") data.allDay = body.allDay;
  if (typeof body.location === "string" || body.location === null) data.location = body.location;
  if (typeof body.category === "string" || body.category === null) data.category = body.category;
  if (typeof body.reminderMinutesBefore === "number" || body.reminderMinutesBefore === null) {
    data.reminderMinutesBefore = body.reminderMinutesBefore;
  }
  if (typeof body.priority === "string") data.priority = body.priority;
  if (typeof body.recurrence === "string") data.recurrence = body.recurrence;
  if (typeof body.recurrenceDays === "string" || body.recurrenceDays === null) {
    data.recurrenceDays = body.recurrenceDays;
  }
  if (typeof body.recurrenceEndDate === "string" || body.recurrenceEndDate === null) {
    data.recurrenceEndDate = body.recurrenceEndDate;
  }
  if (typeof body.completed === "boolean") data.completed = body.completed;
  if (typeof body.subject === "string" || body.subject === null) data.subject = body.subject;
  if (typeof body.estimatedHours === "number" || body.estimatedHours === null) {
    data.estimatedHours = body.estimatedHours;
  }

  const item = await prisma.scheduleItem.update({ where: { id }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.scheduleItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
