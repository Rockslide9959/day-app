import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const routines = await prisma.routine.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(routines);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, icon } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const count = await prisma.routine.count({ where: { userId } });
  const routine = await prisma.routine.create({
    data: { userId, name, icon: icon || "✅", sortOrder: count },
  });
  return NextResponse.json(routine, { status: 201 });
}
