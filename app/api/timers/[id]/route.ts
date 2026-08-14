import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { autoTransitionData } from "@/lib/timers";

export const dynamic = "force-dynamic";

// "complete" and "auto-advance-phase" are only ever sent automatically
// (a client tab noticing its countdown/pomodoro segment ran out) — both
// are guarded by autoTransitionData so they're a no-op if the cron sweep
// already closed out that same segment first. "advance-phase" is the
// manual Skip button and stays unconditional.
const ACTIONS = ["start", "pause", "reset", "complete", "advance-phase", "auto-advance-phase"] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Start/pause/reset/complete all need to read the timer's current run
  // state to compute the next one (e.g. banking elapsed time on pause),
  // so they go through a scoped findFirst rather than a blind updateMany.
  if (typeof body.action === "string") {
    if (!ACTIONS.includes(body.action as Action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    const current = await prisma.timer.findFirst({ where: { id, userId } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const action = body.action as Action;
    let data: Record<string, unknown>;

    switch (action) {
      case "start":
        if (current.status === "running") {
          return NextResponse.json(current);
        }
        data = { status: "running", startedAt: now };
        break;
      case "pause": {
        if (current.status !== "running" || !current.startedAt) {
          data = { status: "paused", startedAt: null };
          break;
        }
        const ranFor = Math.floor((now.getTime() - current.startedAt.getTime()) / 1000);
        data = { status: "paused", accumulatedSeconds: current.accumulatedSeconds + ranFor, startedAt: null };
        break;
      }
      case "reset":
        data = {
          status: "paused",
          accumulatedSeconds: 0,
          startedAt: null,
          ...(current.mode === "pomodoro" ? { phase: "work", cyclesCompleted: 0 } : {}),
        };
        break;
      case "complete": {
        const transition = autoTransitionData(current, now);
        if (!transition) return NextResponse.json(current);
        data = transition;
        break;
      }
      case "advance-phase": {
        if (current.mode !== "pomodoro") {
          return NextResponse.json({ error: "Only pomodoro timers have phases" }, { status: 400 });
        }
        const finishedWork = current.phase !== "break";
        data = {
          phase: finishedWork ? "break" : "work",
          cyclesCompleted: finishedWork ? current.cyclesCompleted + 1 : current.cyclesCompleted,
          accumulatedSeconds: 0,
          startedAt: now,
          status: "running",
        };
        break;
      }
      case "auto-advance-phase": {
        if (current.mode !== "pomodoro") {
          return NextResponse.json({ error: "Only pomodoro timers have phases" }, { status: 400 });
        }
        const transition = autoTransitionData(current, now);
        if (!transition) return NextResponse.json(current);
        data = transition;
        break;
      }
    }

    const updated = await prisma.timer.update({ where: { id }, data });
    return NextResponse.json(updated);
  }

  const data: Record<string, unknown> = {};
  if (typeof body.label === "string") data.label = body.label;
  if (typeof body.durationSeconds === "number" || body.durationSeconds === null) {
    data.durationSeconds = body.durationSeconds;
  }

  const result = await prisma.timer.updateMany({ where: { id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const timer = await prisma.timer.findUnique({ where: { id } });
  return NextResponse.json(timer);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await prisma.timer.deleteMany({ where: { id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
