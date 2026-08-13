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

  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.icon === "string") data.icon = body.icon;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const result = await prisma.routine.updateMany({ where: { id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const routine = await prisma.routine.findUnique({ where: { id } });
  return NextResponse.json(routine);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await prisma.routine.deleteMany({ where: { id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
