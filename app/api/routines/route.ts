import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const routines = await prisma.routine.findMany({
    orderBy: { sortOrder: "asc" },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(routines);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, icon } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const count = await prisma.routine.count();
  const routine = await prisma.routine.create({
    data: { name, icon: icon || "✅", sortOrder: count },
  });
  return NextResponse.json(routine, { status: 201 });
}
