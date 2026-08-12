import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const date = req.nextUrl.searchParams.get("date") || todayStr();
  const run = await prisma.routineRun.findUnique({
    where: { routineId_date: { routineId: id, date } },
  });
  return NextResponse.json({
    completedStepIds: run?.completedStepIds ? run.completedStepIds.split(",").filter(Boolean) : [],
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { stepId, date } = body;
  if (!stepId) {
    return NextResponse.json({ error: "stepId is required" }, { status: 400 });
  }
  const runDate = date || todayStr();

  const existing = await prisma.routineRun.findUnique({
    where: { routineId_date: { routineId: id, date: runDate } },
  });
  const current = existing?.completedStepIds
    ? existing.completedStepIds.split(",").filter(Boolean)
    : [];
  const next = current.includes(stepId)
    ? current.filter((s) => s !== stepId)
    : [...current, stepId];

  const run = await prisma.routineRun.upsert({
    where: { routineId_date: { routineId: id, date: runDate } },
    create: { routineId: id, date: runDate, completedStepIds: next.join(",") },
    update: { completedStepIds: next.join(",") },
  });

  return NextResponse.json({
    completedStepIds: run.completedStepIds.split(",").filter(Boolean),
  });
}
