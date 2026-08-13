import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const linkedType = req.nextUrl.searchParams.get("linkedType");
  const linkedId = req.nextUrl.searchParams.get("linkedId");

  const timers = await prisma.timer.findMany({
    where: linkedType && linkedId ? { userId, linkedType, linkedId } : { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(timers);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { label, mode, durationSeconds, workSeconds, breakSeconds, linkedType, linkedId } = body;

  if (!label || !["stopwatch", "countdown", "pomodoro"].includes(mode)) {
    return NextResponse.json(
      { error: "label is required and mode must be 'stopwatch', 'countdown', or 'pomodoro'" },
      { status: 400 }
    );
  }
  if (mode === "countdown" && (typeof durationSeconds !== "number" || durationSeconds <= 0)) {
    return NextResponse.json(
      { error: "durationSeconds must be a positive number for countdown timers" },
      { status: 400 }
    );
  }
  if (
    mode === "pomodoro" &&
    (typeof workSeconds !== "number" || workSeconds <= 0 || typeof breakSeconds !== "number" || breakSeconds <= 0)
  ) {
    return NextResponse.json(
      { error: "workSeconds and breakSeconds must be positive numbers for pomodoro timers" },
      { status: 400 }
    );
  }

  const timer = await prisma.timer.create({
    data: {
      userId,
      label,
      mode,
      durationSeconds: mode === "countdown" ? Math.round(durationSeconds) : null,
      workSeconds: mode === "pomodoro" ? Math.round(workSeconds) : null,
      breakSeconds: mode === "pomodoro" ? Math.round(breakSeconds) : null,
      phase: mode === "pomodoro" ? "work" : null,
      linkedType: linkedType || null,
      linkedId: linkedId || null,
      status: "running",
      startedAt: new Date(),
    },
  });

  return NextResponse.json(timer, { status: 201 });
}
