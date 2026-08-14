import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  scheduleItem: { findMany: vi.fn() },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn().mockResolvedValue("user-1") }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { GET } from "@/app/api/schedule/search/route";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCurrentUserId.mockResolvedValue("user-1");
  vi.useRealTimers();
});

function req(q: string) {
  return new NextRequest(`http://localhost/api/schedule/search?q=${encodeURIComponent(q)}`);
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    itemType: "event",
    title: "Match",
    date: "2026-08-14",
    startTime: "09:00",
    allDay: false,
    completed: false,
    ...overrides,
  };
}

describe("GET /api/schedule/search", () => {
  it("returns 401 without a session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await GET(req("gym"));
    expect(res.status).toBe(401);
  });

  it("returns [] for an empty query without hitting the database", async () => {
    const res = await GET(req(""));
    const body = await res.json();
    expect(body).toEqual([]);
    expect(prismaMock.scheduleItem.findMany).not.toHaveBeenCalled();
  });

  it("includes an incomplete overdue task and a completed future task", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));

    prismaMock.scheduleItem.findMany.mockResolvedValue([
      item({ id: "task-overdue", itemType: "task", title: "Overdue task", date: "2026-08-01", completed: false, allDay: true }),
      item({ id: "task-future", itemType: "task", title: "Future completed task", date: "2026-08-20", completed: true, allDay: true }),
    ]);

    const res = await GET(req("task"));
    const body = await res.json();

    expect(body.map((i: { id: string }) => i.id).sort()).toEqual(["task-future", "task-overdue"]);
  });

  it("hides a task that's completed and past its due moment", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));

    prismaMock.scheduleItem.findMany.mockResolvedValue([
      item({ id: "task-past", itemType: "task", title: "Old completed task", date: "2026-08-01", completed: true, allDay: true }),
    ]);

    const res = await GET(req("task"));
    const body = await res.json();

    expect(body).toEqual([]);
  });

  it("always includes events regardless of completion state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));

    prismaMock.scheduleItem.findMany.mockResolvedValue([
      item({ id: "evt-done", itemType: "event", title: "Done long ago", date: "2020-01-01", completed: true }),
    ]);

    const res = await GET(req("done"));
    const body = await res.json();

    expect(body.map((i: { id: string }) => i.id)).toEqual(["evt-done"]);
  });
});
