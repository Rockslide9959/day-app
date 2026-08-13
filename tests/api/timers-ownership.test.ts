import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  timer: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { PATCH as patchTimer, DELETE as deleteTimer } from "@/app/api/timers/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("timer ownership enforcement", () => {
  it("returns 401 for PATCH when there's no session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await patchTimer(req("http://localhost/api/timers/t-1", "PATCH", { action: "pause" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res.status).toBe(401);
    expect(prismaMock.timer.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 (not another user's data) when pausing a timer that isn't yours", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    // findFirst is scoped by {id, userId} — a different owner's row simply
    // isn't found, so nothing about it (existence, current state) leaks.
    prismaMock.timer.findFirst.mockResolvedValue(null);

    const res = await patchTimer(
      req("http://localhost/api/timers/user-A-timer", "PATCH", { action: "pause" }),
      { params: Promise.resolve({ id: "user-A-timer" }) }
    );

    expect(res.status).toBe(404);
    expect(prismaMock.timer.findFirst).toHaveBeenCalledWith({
      where: { id: "user-A-timer", userId: "user-B" },
    });
    expect(prismaMock.timer.update).not.toHaveBeenCalled();
  });

  it("scopes label/duration edits by userId via updateMany", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.timer.updateMany.mockResolvedValue({ count: 0 });

    const res = await patchTimer(
      req("http://localhost/api/timers/user-A-timer", "PATCH", { label: "hijacked" }),
      { params: Promise.resolve({ id: "user-A-timer" }) }
    );

    expect(res.status).toBe(404);
    expect(prismaMock.timer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-A-timer", userId: "user-B" } })
    );
  });

  it("returns 404 when deleting someone else's timer", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.timer.deleteMany.mockResolvedValue({ count: 0 });

    const res = await deleteTimer(req("http://localhost/api/timers/user-A-timer", "DELETE"), {
      params: Promise.resolve({ id: "user-A-timer" }),
    });

    expect(res.status).toBe(404);
    expect(prismaMock.timer.deleteMany).toHaveBeenCalledWith({
      where: { id: "user-A-timer", userId: "user-B" },
    });
  });

  it("pauses and banks elapsed seconds when the timer actually belongs to the requester", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    const startedAt = new Date(Date.now() - 5000);
    prismaMock.timer.findFirst.mockResolvedValue({
      id: "t-1",
      userId: "user-A",
      mode: "stopwatch",
      status: "running",
      accumulatedSeconds: 10,
      startedAt,
      durationSeconds: null,
    });
    prismaMock.timer.update.mockResolvedValue({ id: "t-1", status: "paused" });

    const res = await patchTimer(req("http://localhost/api/timers/t-1", "PATCH", { action: "pause" }), {
      params: Promise.resolve({ id: "t-1" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.timer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-1" },
        data: expect.objectContaining({ status: "paused", startedAt: null }),
      })
    );
  });

  it("advances a pomodoro from work to break and bumps the round count, scoped to the requester", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    prismaMock.timer.findFirst.mockResolvedValue({
      id: "t-2",
      userId: "user-A",
      mode: "pomodoro",
      status: "running",
      phase: "work",
      cyclesCompleted: 2,
      workSeconds: 1500,
      breakSeconds: 300,
      accumulatedSeconds: 1500,
      startedAt: new Date(),
      durationSeconds: null,
    });
    prismaMock.timer.update.mockResolvedValue({ id: "t-2", phase: "break" });

    const res = await patchTimer(req("http://localhost/api/timers/t-2", "PATCH", { action: "advance-phase" }), {
      params: Promise.resolve({ id: "t-2" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.timer.findFirst).toHaveBeenCalledWith({ where: { id: "t-2", userId: "user-A" } });
    expect(prismaMock.timer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-2" },
        data: expect.objectContaining({ phase: "break", cyclesCompleted: 3, status: "running" }),
      })
    );
  });

  it("rejects advance-phase for a non-pomodoro timer", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    prismaMock.timer.findFirst.mockResolvedValue({
      id: "t-3",
      userId: "user-A",
      mode: "countdown",
      status: "running",
      durationSeconds: 60,
    });

    const res = await patchTimer(req("http://localhost/api/timers/t-3", "PATCH", { action: "advance-phase" }), {
      params: Promise.resolve({ id: "t-3" }),
    });

    expect(res.status).toBe(400);
    expect(prismaMock.timer.update).not.toHaveBeenCalled();
  });
});
