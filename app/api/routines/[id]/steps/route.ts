import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const routine = await prisma.routine.findFirst({ where: { id, userId } });
  if (!routine) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title } = body;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const count = await prisma.routineStep.count({ where: { routineId: id } });
  const step = await prisma.routineStep.create({
    data: { routineId: id, title, sortOrder: count },
  });
  return NextResponse.json(step, { status: 201 });
}
