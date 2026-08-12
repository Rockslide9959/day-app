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
  if (typeof body.date === "string") data.date = body.date;
  if (typeof body.startTime === "string") data.startTime = body.startTime;
  if (typeof body.endTime === "string") data.endTime = body.endTime;

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
