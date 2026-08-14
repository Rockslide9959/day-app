import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  scheduleItem: { updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  todo: { updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { PATCH as patchSchedule, DELETE as deleteSchedule } from "@/app/api/schedule/[id]/route";
import { DELETE as deleteTodo } from "@/app/api/todos/[id]/route";

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

describe("ownership enforcement", () => {
  it("returns 401 for schedule PATCH when there's no session at all", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await patchSchedule(req("http://localhost/api/schedule/evt-1", "PATCH", { title: "x" }), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(401);
    expect(prismaMock.scheduleItem.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 (not 200) when a logged-in user tries to edit someone else's event", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    // updateMany's own {id, userId} filter naturally matches nothing when
    // the event belongs to a different user — this is the real
    // enforcement mechanism, not a separate ownership check.
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 0 });

    const res = await patchSchedule(
      req("http://localhost/api/schedule/user-A-event", "PATCH", { title: "hijacked" }),
      { params: Promise.resolve({ id: "user-A-event" }) }
    );

    expect(res.status).toBe(404);
    expect(prismaMock.scheduleItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-A-event", userId: "user-B" } })
    );
  });

  it("returns 404 when a logged-in user tries to delete someone else's event", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.scheduleItem.deleteMany.mockResolvedValue({ count: 0 });

    const res = await deleteSchedule(req("http://localhost/api/schedule/user-A-event", "DELETE"), {
      params: Promise.resolve({ id: "user-A-event" }),
    });

    expect(res.status).toBe(404);
  });

  it("succeeds when the event actually belongs to the requesting user", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    prismaMock.scheduleItem.deleteMany.mockResolvedValue({ count: 1 });

    const res = await deleteSchedule(req("http://localhost/api/schedule/user-A-event", "DELETE"), {
      params: Promise.resolve({ id: "user-A-event" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 404 when a logged-in user tries to edit someone else's task", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 0 });

    const res = await patchSchedule(
      req("http://localhost/api/schedule/user-A-task", "PATCH", { completed: true }),
      { params: Promise.resolve({ id: "user-A-task" }) }
    );

    expect(res.status).toBe(404);
    expect(prismaMock.scheduleItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-A-task", userId: "user-B" } })
    );
  });

  it("returns 404 when a logged-in user tries to delete someone else's task", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.scheduleItem.deleteMany.mockResolvedValue({ count: 0 });

    const res = await deleteSchedule(req("http://localhost/api/schedule/user-A-task", "DELETE"), {
      params: Promise.resolve({ id: "user-A-task" }),
    });

    expect(res.status).toBe(404);
  });

  it("scopes todo deletion by userId the same way", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.todo.deleteMany.mockResolvedValue({ count: 0 });

    const res = await deleteTodo(req("http://localhost/api/todos/user-A-todo", "DELETE"), {
      params: Promise.resolve({ id: "user-A-todo" }),
    });

    expect(res.status).toBe(404);
    expect(prismaMock.todo.deleteMany).toHaveBeenCalledWith({
      where: { id: "user-A-todo", userId: "user-B" },
    });
  });
});
