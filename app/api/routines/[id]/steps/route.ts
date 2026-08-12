import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
