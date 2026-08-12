import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const reminders = await prisma.reminder.findMany({
    where: { completed: false },
    orderBy: { dueAt: "asc" },
  });
  return NextResponse.json(reminders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, notes, dueAt, recurrence } = body;

  if (!title || !dueAt) {
    return NextResponse.json({ error: "title and dueAt are required" }, { status: 400 });
  }

  const reminder = await prisma.reminder.create({
    data: {
      title,
      notes: notes || null,
      dueAt: new Date(dueAt),
      recurrence: recurrence || "none",
    },
  });
  return NextResponse.json(reminder, { status: 201 });
}
