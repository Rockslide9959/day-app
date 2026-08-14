import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  scheduleItem: { findFirst: vi.fn(), create: vi.fn() },
  eventShare: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { GET as listShares, POST as createShare } from "@/app/api/schedule/[id]/share/route";
import { DELETE as deleteShare } from "@/app/api/shares/[id]/route";
import { GET as getInvite, POST as acceptInvite } from "@/app/api/invites/[token]/route";

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

describe("share creation/listing is scoped to the event's owner", () => {
  it("returns 401 for GET without a session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await listShares(req("http://localhost/api/schedule/evt-1/share", "GET"), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(401);
    expect(prismaMock.eventShare.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 (not another user's shares) when listing shares for an event you don't own", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.scheduleItem.findFirst.mockResolvedValue(null);

    const res = await listShares(req("http://localhost/api/schedule/user-A-event/share", "GET"), {
      params: Promise.resolve({ id: "user-A-event" }),
    });

    expect(res.status).toBe(404);
    expect(prismaMock.scheduleItem.findFirst).toHaveBeenCalledWith({
      where: { id: "user-A-event", userId: "user-B" },
    });
    expect(prismaMock.eventShare.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when creating a share link for an event you don't own", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.scheduleItem.findFirst.mockResolvedValue(null);

    const res = await createShare(req("http://localhost/api/schedule/user-A-event/share", "POST"), {
      params: Promise.resolve({ id: "user-A-event" }),
    });

    expect(res.status).toBe(404);
    expect(prismaMock.eventShare.create).not.toHaveBeenCalled();
  });

  it("creates a share attributed to the requester when they own the event", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    prismaMock.scheduleItem.findFirst.mockResolvedValue({ id: "evt-1", userId: "user-A" });
    prismaMock.eventShare.create.mockResolvedValue({ id: "share-1", token: "tok123" });

    const res = await createShare(req("http://localhost/api/schedule/evt-1/share", "POST"), {
      params: Promise.resolve({ id: "evt-1" }),
    });

    expect(res.status).toBe(201);
    expect(prismaMock.eventShare.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduleItemId: "evt-1", createdByUserId: "user-A" }),
      })
    );
  });
});

describe("revoking a share is scoped to whoever created it", () => {
  it("returns 404 when revoking a share you didn't create", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.eventShare.deleteMany.mockResolvedValue({ count: 0 });

    const res = await deleteShare(req("http://localhost/api/shares/share-1", "DELETE"), {
      params: Promise.resolve({ id: "share-1" }),
    });

    expect(res.status).toBe(404);
    expect(prismaMock.eventShare.deleteMany).toHaveBeenCalledWith({
      where: { id: "share-1", createdByUserId: "user-B" },
    });
  });

  it("succeeds when the requester created the share", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    prismaMock.eventShare.deleteMany.mockResolvedValue({ count: 1 });

    const res = await deleteShare(req("http://localhost/api/shares/share-1", "DELETE"), {
      params: Promise.resolve({ id: "share-1" }),
    });

    expect(res.status).toBe(200);
  });
});

describe("invite preview and accept", () => {
  it("returns 401 for GET without a session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await getInvite(req("http://localhost/api/invites/tok123", "GET"), {
      params: Promise.resolve({ token: "tok123" }),
    });
    expect(res.status).toBe(401);
    expect(prismaMock.eventShare.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown or revoked token", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.eventShare.findUnique.mockResolvedValue(null);

    const res = await getInvite(req("http://localhost/api/invites/bogus", "GET"), {
      params: Promise.resolve({ token: "bogus" }),
    });

    expect(res.status).toBe(404);
  });

  it("previews the shared event without exposing owner-only fields", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.eventShare.findUnique.mockResolvedValue({
      token: "tok123",
      scheduleItem: {
        title: "Team sync",
        notes: "Bring laptop",
        date: "2026-08-20",
        startTime: "10:00",
        endTime: "11:00",
        endDate: null,
        allDay: false,
        location: "Room 4",
        category: "Work",
        priority: "normal",
        subject: null,
        estimatedHours: null,
      },
      createdBy: { username: "alice" },
    });

    const res = await getInvite(req("http://localhost/api/invites/tok123", "GET"), {
      params: Promise.resolve({ token: "tok123" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("Team sync");
    expect(body.sharedByUsername).toBe("alice");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("id");
  });

  it("returns 401 for POST (accept) without a session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await acceptInvite(req("http://localhost/api/invites/tok123", "POST"), {
      params: Promise.resolve({ token: "tok123" }),
    });
    expect(res.status).toBe(401);
    expect(prismaMock.scheduleItem.create).not.toHaveBeenCalled();
  });

  it("creates the copy under the accepting user, not the original owner", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.eventShare.findUnique.mockResolvedValue({
      token: "tok123",
      scheduleItem: {
        userId: "user-A",
        title: "Team sync",
        notes: null,
        date: "2026-08-20",
        startTime: "10:00",
        endTime: "11:00",
        endDate: null,
        allDay: false,
        location: null,
        category: null,
        reminderMinutesBefore: null,
        priority: "normal",
        subject: null,
        estimatedHours: null,
      },
    });
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "new-evt", userId: "user-B" });

    const res = await acceptInvite(req("http://localhost/api/invites/tok123", "POST"), {
      params: Promise.resolve({ token: "tok123" }),
    });

    expect(res.status).toBe(201);
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-B", title: "Team sync" }),
      })
    );
  });

  it("previews a shared task with its itemType intact", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.eventShare.findUnique.mockResolvedValue({
      token: "tok123",
      scheduleItem: {
        itemType: "task",
        title: "Submit report",
        notes: null,
        date: "2026-08-20",
        startTime: "17:00",
        endTime: "17:00",
        endDate: "2026-08-20",
        allDay: false,
        location: null,
        category: "Assignment",
        priority: "high",
        subject: null,
        estimatedHours: null,
      },
      createdBy: { username: "alice" },
    });

    const res = await getInvite(req("http://localhost/api/invites/tok123", "GET"), {
      params: Promise.resolve({ token: "tok123" }),
    });
    const body = await res.json();

    expect(body.itemType).toBe("task");
  });

  it("creates a task copy (not an event) when accepting an invite for a shared task", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.eventShare.findUnique.mockResolvedValue({
      token: "tok123",
      scheduleItem: {
        userId: "user-A",
        itemType: "task",
        title: "Submit report",
        notes: null,
        date: "2026-08-20",
        startTime: "17:00",
        endTime: "17:00",
        endDate: "2026-08-20",
        allDay: false,
        location: null,
        category: "Assignment",
        reminderMinutesBefore: null,
        priority: "high",
        subject: null,
        estimatedHours: null,
      },
    });
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "new-task", userId: "user-B", itemType: "task" });

    const res = await acceptInvite(req("http://localhost/api/invites/tok123", "POST"), {
      params: Promise.resolve({ token: "tok123" }),
    });

    expect(res.status).toBe(201);
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-B", itemType: "task" }),
      })
    );
  });
});
