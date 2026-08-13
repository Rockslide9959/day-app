import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, stepId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const result = await prisma.routineStep.updateMany({
    where: { id: stepId, routineId: id, routine: { userId } },
    data,
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const step = await prisma.routineStep.findUnique({ where: { id: stepId } });
  return NextResponse.json(step);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, stepId } = await params;
  const result = await prisma.routineStep.deleteMany({
    where: { id: stepId, routineId: id, routine: { userId } },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
