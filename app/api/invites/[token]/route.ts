import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

// A link's target isn't user-scoped (anyone holding the token can look
// it up), but the visitor still has to be logged in to reach this route
// at all — proxy.ts gates every /api/* path the same way as the rest of
// the app, redirecting an unauthenticated page visit to /login?next=...
// first.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const share = await prisma.eventShare.findUnique({
    where: { token },
    include: { scheduleItem: true, createdBy: { select: { username: true } } },
  });
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const e = share.scheduleItem;
  return NextResponse.json({
    title: e.title,
    notes: e.notes,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    endDate: e.endDate,
    allDay: e.allDay,
    location: e.location,
    category: e.category,
    priority: e.priority,
    subject: e.subject,
    estimatedHours: e.estimatedHours,
    sharedByUsername: share.createdBy.username,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const share = await prisma.eventShare.findUnique({
    where: { token },
    include: { scheduleItem: true },
  });
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const e = share.scheduleItem;
  const copy = await prisma.scheduleItem.create({
    data: {
      userId,
      title: e.title,
      notes: e.notes,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      endDate: e.endDate,
      allDay: e.allDay,
      location: e.location,
      category: e.category,
      reminderMinutesBefore: e.reminderMinutesBefore,
      priority: e.priority,
      // Recurrence and completion state intentionally aren't copied —
      // same convention as duplicating an event within one account (see
      // app/api/schedule/[id]/duplicate/route.ts).
      subject: e.subject,
      estimatedHours: e.estimatedHours,
    },
  });

  return NextResponse.json(copy, { status: 201 });
}
