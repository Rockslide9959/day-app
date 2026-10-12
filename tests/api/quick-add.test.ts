import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { normalizeActions } from "@/lib/quickAdd/normalize";
import type { QuickAddContext } from "@/lib/quickAdd/types";

const prismaMock = vi.hoisted(() => ({
  habit: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  todo: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  eventCategory: { findMany: vi.fn() },
  scheduleItem: { create: vi.fn(), deleteMany: vi.fn() },
  habitLog: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  notebookEntry: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
}));
const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));
const aiMock = vi.hoisted(() => ({ isAiEnabled: vi.fn(() => false), interpretWithAi: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/quickAdd/ai", () => aiMock);

import { POST as quickAdd } from "@/app/api/quick-add/route";
import { POST as undo } from "@/app/api/quick-add/undo/route";

function post(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const CLOCK = { today: "2026-10-12", nowMinutes: 600, timeZone: "Africa/Johannesburg" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCurrentUserId.mockResolvedValue("user-A");
  prismaMock.habit.findMany.mockResolvedValue([]);
  prismaMock.todo.findMany.mockResolvedValue([]);
  prismaMock.eventCategory.findMany.mockResolvedValue([]);
  prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-1" });
  aiMock.isAiEnabled.mockReturnValue(false);
});

describe("POST /api/quick-add", () => {
  it("requires a session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await quickAdd(post("http://localhost/api/quick-add", { text: "x", ...CLOCK }));
    expect(res.status).toBe(401);
  });

  it("creates an event for the signed-in user with the rules engine", async () => {
    const res = await quickAdd(post("http://localhost/api/quick-add", { text: "date night on october 15th at 7pm", ...CLOCK }));
    const body = await res.json();
    expect(body.engine).toBe("rules");
    expect(body.results[0]).toMatchObject({ ok: true, kind: "event", title: "Date night", undo: { type: "delete", model: "scheduleItem", id: "evt-1" } });
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-A", title: "Date night", date: "2026-10-15", startTime: "19:00", endTime: "21:00", itemType: "event" }),
    });
  });

  it("falls back to the rules engine when the AI call fails", async () => {
    aiMock.isAiEnabled.mockReturnValue(true);
    aiMock.interpretWithAi.mockRejectedValue(new Error("network"));
    const res = await quickAdd(post("http://localhost/api/quick-add", { text: "dentist friday 10am", ...CLOCK }));
    const body = await res.json();
    expect(body.engine).toBe("rules");
    expect(body.results).toHaveLength(1);
  });

  it("uses the AI's actions when it succeeds", async () => {
    aiMock.isAiEnabled.mockReturnValue(true);
    aiMock.interpretWithAi.mockResolvedValue({
      actions: [{ kind: "task", title: "Project", date: "2026-11-09", dueTime: "23:59", category: "Assignment", priority: "normal", notes: null }],
      message: null,
    });
    const body = await (await quickAdd(post("http://localhost/api/quick-add", { text: "project due nov 9 midnight", ...CLOCK }))).json();
    expect(body.engine).toBe("ai");
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemType: "task", date: "2026-11-09", startTime: "23:59", allDay: false }),
    });
  });

  it("relays the AI's message when it can't act", async () => {
    aiMock.isAiEnabled.mockReturnValue(true);
    aiMock.interpretWithAi.mockResolvedValue({ actions: [], message: "What time is the meeting?" });
    const body = await (await quickAdd(post("http://localhost/api/quick-add", { text: "meeting", ...CLOCK }))).json();
    expect(body).toMatchObject({ results: [], message: "What time is the meeting?" });
  });
});

describe("POST /api/quick-add/undo", () => {
  it("only deletes the caller's own rows", async () => {
    prismaMock.scheduleItem.deleteMany.mockResolvedValue({ count: 0 });
    const res = await undo(post("http://localhost/api/quick-add/undo", { undo: { type: "delete", model: "scheduleItem", id: "someone-elses" } }));
    expect(res.status).toBe(404);
    expect(prismaMock.scheduleItem.deleteMany).toHaveBeenCalledWith({ where: { id: "someone-elses", userId: "user-A" } });
  });

  it("restores a habit count only on an owned habit", async () => {
    prismaMock.habit.findFirst.mockResolvedValue(null);
    const res = await undo(post("http://localhost/api/quick-add/undo", { undo: { type: "habitCount", habitId: "h", date: "2026-10-12", count: 2 } }));
    expect(res.status).toBe(404);
    expect(prismaMock.habitLog.upsert).not.toHaveBeenCalled();
  });

  it("rejects unknown undo types", async () => {
    const res = await undo(post("http://localhost/api/quick-add/undo", { undo: { type: "dropTables" } }));
    expect(res.status).toBe(400);
  });
});

describe("normalizeActions", () => {
  const ctx: QuickAddContext = {
    ...CLOCK,
    categories: ["Social", "Assignment"],
    habits: [{ id: "h1", name: "Read", emoji: "📚", target: 1, unit: null }],
    openTodos: [{ id: "t1", title: "Buy milk" }],
  };

  it("drops invalid or foreign references and fixes up times", () => {
    const out = normalizeActions(
      [
        { kind: "event", title: "Dinner", date: "2026-10-15", start_time: "19:00", end_time: null, category: "social" },
        { kind: "event", title: "Bad date", date: "2026-02-30" },
        { kind: "habit_log", habit_id: "not-mine", amount: 1 },
        { kind: "todo_complete", todo_id: "t1" },
        { kind: "task", title: "Essay", date: "2026-11-01", due_time: "25:00", category: "Made up" },
        { kind: "journal", date: "2030-01-01", content: "future" },
      ],
      ctx
    );
    expect(out).toEqual([
      expect.objectContaining({ kind: "event", title: "Dinner", endTime: "20:00", category: "Social" }),
      { kind: "todo_complete", todoId: "t1", title: "Buy milk" },
      expect.objectContaining({ kind: "task", title: "Essay", dueTime: null, category: null }),
      { kind: "journal", date: "2026-10-12", content: "future" },
    ]);
  });
});
