import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.notes === "string" || body.notes === null) data.notes = body.notes;
  if (typeof body.dueAt === "string") data.dueAt = new Date(body.dueAt);
  if (typeof body.recurrence === "string") data.recurrence = body.recurrence;
  if (typeof body.completed === "boolean") data.completed = body.completed;
  if (typeof body.notified === "boolean") data.notified = body.notified;

  const reminder = await prisma.reminder.update({ where: { id }, data });
  return NextResponse.json(reminder);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.reminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
