import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.notes === "string" || body.notes === null) data.notes = body.notes;
  if (typeof body.dueAt === "string") data.dueAt = new Date(body.dueAt);
  if (typeof body.recurrence === "string") data.recurrence = body.recurrence;
  if (typeof body.completed === "boolean") data.completed = body.completed;
  if (typeof body.notified === "boolean") data.notified = body.notified;

  const result = await prisma.reminder.updateMany({ where: { id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  return NextResponse.json(reminder);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await prisma.reminder.deleteMany({ where: { id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
