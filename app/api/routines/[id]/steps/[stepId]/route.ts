import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { stepId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const step = await prisma.routineStep.update({ where: { id: stepId }, data });
  return NextResponse.json(step);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { stepId } = await params;
  await prisma.routineStep.delete({ where: { id: stepId } });
  return NextResponse.json({ ok: true });
}
