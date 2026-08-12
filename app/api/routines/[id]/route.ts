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

  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.icon === "string") data.icon = body.icon;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const routine = await prisma.routine.update({ where: { id }, data });
  return NextResponse.json(routine);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.routine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
