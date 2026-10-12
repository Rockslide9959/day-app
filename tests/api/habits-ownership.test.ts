import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  habit: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  habitLog: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { PATCH as patchHabit, DELETE as deleteHabit } from "@/app/api/habits/[id]/route";
import { PUT as putLog } from "@/app/api/habits/[id]/log/route";

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

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const log = (id: string, body: unknown) => putLog(req(`http://localhost/api/habits/${id}/log`, "PUT", body), params(id));

describe("habit ownership enforcement", () => {
  it("returns 401 without a session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await log("h-1", { date: "2026-10-12", today: "2026-10-12", count: 1 });
    expect(res.status).toBe(401);
    expect(prismaMock.habit.findFirst).not.toHaveBeenCalled();
  });

  it("won't log against another user's habit", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.habit.findFirst.mockResolvedValue(null);
    const res = await log("user-A-habit", { date: "2026-10-12", today: "2026-10-12", count: 1 });
    expect(res.status).toBe(404);
    expect(prismaMock.habit.findFirst).toHaveBeenCalledWith({
      where: { id: "user-A-habit", userId: "user-B" },
      select: { id: true },
    });
    expect(prismaMock.habitLog.upsert).not.toHaveBeenCalled();
  });

  it("scopes edits and deletes to the owner", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.habit.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.habit.deleteMany.mockResolvedValue({ count: 0 });

    const patched = await patchHabit(req("http://localhost/api/habits/h", "PATCH", { name: "Mine now" }), params("h"));
    const deleted = await deleteHabit(req("http://localhost/api/habits/h", "DELETE"), params("h"));

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(prismaMock.habit.updateMany).toHaveBeenCalledWith({
      where: { id: "h", userId: "user-B" },
      data: { name: "Mine now" },
    });
    expect(prismaMock.habit.deleteMany).toHaveBeenCalledWith({ where: { id: "h", userId: "user-B" } });
  });
});

describe("habit log validation", () => {
  beforeEach(() => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    prismaMock.habit.findFirst.mockResolvedValue({ id: "h" });
  });

  it("rejects future days", async () => {
    const res = await log("h", { date: "2026-10-13", today: "2026-10-12", count: 1 });
    expect(res.status).toBe(400);
  });

  it("rejects bad counts", async () => {
    expect((await log("h", { date: "2026-10-12", today: "2026-10-12", count: -1 })).status).toBe(400);
    expect((await log("h", { date: "2026-10-12", today: "2026-10-12", count: 1.5 })).status).toBe(400);
  });

  it("upserts a positive count and deletes on zero", async () => {
    await log("h", { date: "2026-10-12", today: "2026-10-12", count: 3 });
    expect(prismaMock.habitLog.upsert).toHaveBeenCalledWith({
      where: { habitId_date: { habitId: "h", date: "2026-10-12" } },
      create: { habitId: "h", date: "2026-10-12", count: 3 },
      update: { count: 3 },
    });

    await log("h", { date: "2026-10-12", today: "2026-10-12", count: 0 });
    expect(prismaMock.habitLog.deleteMany).toHaveBeenCalledWith({ where: { habitId: "h", date: "2026-10-12" } });
  });
});
