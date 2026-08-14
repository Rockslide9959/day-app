import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const original = await prisma.scheduleItem.findFirst({ where: { id, userId } });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const copy = await prisma.scheduleItem.create({
    data: {
      userId,
      itemType: original.itemType,
      title: original.title,
      notes: original.notes,
      date: original.date,
      startTime: original.startTime,
      endTime: original.endTime,
      endDate: original.endDate,
      allDay: original.allDay,
      location: original.location,
      category: original.category,
      reminderMinutesBefore: original.reminderMinutesBefore,
      priority: original.priority,
      // Recurrence and completion state intentionally aren't copied — a
      // duplicate is a fresh one-off event the user can adjust and
      // re-enable recurrence on if they want.
      subject: original.subject,
      estimatedHours: original.estimatedHours,
    },
  });

  return NextResponse.json(copy, { status: 201 });
}
