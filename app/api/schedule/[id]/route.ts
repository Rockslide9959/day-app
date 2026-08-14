import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { validateItemType } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Toggling completion for one occurrence of a recurring event is a
  // separate, narrower operation from editing the series itself — it
  // only ever touches completedDates, never the other fields.
  if (typeof body.toggleCompletedDate === "string") {
    const current = await prisma.scheduleItem.findFirst({ where: { id, userId } });
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

  // Converting between event and task: re-derive the fields the new type
  // needs rather than trusting the client's raw endDate/location, so a
  // malformed or manually-crafted request can't leave a task with a
  // multi-day range or an event stuck at a single due instant. Completion
  // state and recurrence are shared, compatible fields and carry over
  // untouched.
  if (typeof body.itemType === "string") {
    const itemTypeError = validateItemType(body.itemType);
    if (itemTypeError) return NextResponse.json({ error: itemTypeError }, { status: 400 });
    if (body.itemType === "task" && typeof body.date !== "string") {
      return NextResponse.json(
        { error: "date (due date) is required when converting to a task" },
        { status: 400 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (typeof body.itemType === "string") data.itemType = body.itemType;
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
  if (typeof body.completed === "boolean") {
    data.completed = body.completed;
    // Informational only — the visibility rule (lib/calendar/visibility.ts)
    // depends on `completed` + the due date/time, not this timestamp.
    data.completedAt = body.completed ? new Date() : null;
  }
  if (typeof body.subject === "string" || body.subject === null) data.subject = body.subject;
  if (typeof body.estimatedHours === "number" || body.estimatedHours === null) {
    data.estimatedHours = body.estimatedHours;
  }

  if (data.itemType === "task") {
    // date is guaranteed present here (checked above) — collapse to a
    // single-day due instant regardless of what endDate/location the
    // request included.
    data.endDate = data.date;
    data.location = null;
    if (typeof data.startTime === "string" && data.allDay !== true) {
      data.endTime = data.startTime;
    }
  }

  const result = await prisma.scheduleItem.updateMany({ where: { id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const item = await prisma.scheduleItem.findUnique({ where: { id } });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await prisma.scheduleItem.deleteMany({ where: { id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
