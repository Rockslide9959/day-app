import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  scheduleItem: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn().mockResolvedValue("user-1") }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { GET, POST } from "@/app/api/schedule/route";
import { DELETE, PATCH } from "@/app/api/schedule/[id]/route";
import { POST as DUPLICATE } from "@/app/api/schedule/[id]/duplicate/route";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCurrentUserId.mockResolvedValue("user-1");
});

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/schedule (create)", () => {
  it("creates a local schedule item from valid input, owned by the logged-in user", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({
      id: "evt-1",
      title: "Dentist",
      date: "2026-08-14",
      startTime: "10:00",
      endTime: "11:00",
    });

    const res = await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        title: "Dentist",
        date: "2026-08-14",
        startTime: "10:00",
        endTime: "11:00",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.title).toBe("Dentist");
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1", title: "Dentist", date: "2026-08-14" }) })
    );
  });

  it("rejects a request missing required fields without touching the database", async () => {
    const res = await POST(jsonRequest("http://localhost/api/schedule", "POST", { title: "No times given" }));
    expect(res.status).toBe(400);
    expect(prismaMock.scheduleItem.create).not.toHaveBeenCalled();
  });

  it("rejects when there's no session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        title: "Dentist",
        date: "2026-08-14",
        startTime: "10:00",
        endTime: "11:00",
      })
    );
    expect(res.status).toBe(401);
    expect(prismaMock.scheduleItem.create).not.toHaveBeenCalled();
  });

  it("creates an all-day event with the allDay flag and default times", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-2" });
    await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        title: "Public holiday",
        date: "2026-12-25",
        startTime: "00:00",
        endTime: "23:59",
        allDay: true,
      })
    );
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allDay: true }) })
    );
  });

  it("stores priority, recurrence and study fields", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-3" });
    await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        title: "PROG7311 Assignment",
        date: "2026-08-20",
        startTime: "00:00",
        endTime: "23:59",
        category: "Assignment",
        priority: "high",
        subject: "PROG7311",
        estimatedHours: 6,
        recurrence: "weekly",
        recurrenceDays: "1,3",
      })
    );
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: "high",
          subject: "PROG7311",
          estimatedHours: 6,
          recurrence: "weekly",
          recurrenceDays: "1,3",
        }),
      })
    );
  });
});

describe("GET /api/schedule (range query)", () => {
  it("scopes the query to the logged-in user and both plain and recurring events", async () => {
    prismaMock.scheduleItem.findMany.mockResolvedValue([]);
    const req = new NextRequest("http://localhost/api/schedule?from=2026-08-01&to=2026-08-31");
    await GET(req);

    const call = prismaMock.scheduleItem.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe("user-1");
    expect(call.where.OR).toHaveLength(2);
    expect(call.where.OR[0]).toMatchObject({ recurrence: "none" });
    expect(call.where.OR[1]).toMatchObject({ NOT: { recurrence: "none" } });
  });

  it("expands a recurring master into occurrences within the range", async () => {
    prismaMock.scheduleItem.findMany.mockResolvedValue([
      {
        id: "master-1",
        title: "Standup",
        notes: null,
        date: "2026-08-03",
        startTime: "09:00",
        endTime: "09:15",
        endDate: null,
        allDay: false,
        location: null,
        category: null,
        priority: "normal",
        reminderMinutesBefore: null,
        recurrence: "weekly",
        recurrenceDays: null,
        recurrenceEndDate: null,
        completed: false,
        completedDates: "",
        subject: null,
        estimatedHours: null,
      },
    ]);
    const req = new NextRequest("http://localhost/api/schedule?from=2026-08-01&to=2026-08-17");
    const res = await GET(req);
    const body = await res.json();

    // 2026-08-03, 10, 17 are all Mondays
    expect(body).toHaveLength(3);
    expect(body.every((e: { id: string }) => e.id === "master-1")).toBe(true);
    const occurrenceIds = new Set(body.map((e: { occurrenceId: string }) => e.occurrenceId));
    expect(occurrenceIds.size).toBe(3);
  });
});

describe("PATCH /api/schedule/[id] (edit)", () => {
  it("updates the provided fields, scoped to the owner", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "evt-1", title: "Updated" });

    const res = await PATCH(jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { title: "Updated" }), {
      params: Promise.resolve({ id: "evt-1" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.scheduleItem.updateMany).toHaveBeenCalledWith({
      where: { id: "evt-1", userId: "user-1" },
      data: { title: "Updated" },
    });
  });

  it("toggles a single occurrence's completion without touching other fields", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({ id: "evt-1", completedDates: "2026-08-03" });
    prismaMock.scheduleItem.update.mockResolvedValue({ id: "evt-1", completedDates: "2026-08-03,2026-08-10" });

    await PATCH(
      jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { toggleCompletedDate: "2026-08-10" }),
      { params: Promise.resolve({ id: "evt-1" }) }
    );

    expect(prismaMock.scheduleItem.findFirst).toHaveBeenCalledWith({ where: { id: "evt-1", userId: "user-1" } });
    expect(prismaMock.scheduleItem.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { completedDates: "2026-08-03,2026-08-10" },
    });
  });

  it("un-marks a date that was already completed (toggle off)", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({ id: "evt-1", completedDates: "2026-08-03,2026-08-10" });
    prismaMock.scheduleItem.update.mockResolvedValue({ id: "evt-1" });

    await PATCH(
      jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { toggleCompletedDate: "2026-08-10" }),
      { params: Promise.resolve({ id: "evt-1" }) }
    );

    expect(prismaMock.scheduleItem.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { completedDates: "2026-08-03" },
    });
  });
});

describe("DELETE /api/schedule/[id]", () => {
  it("deletes the event when owned by the requester", async () => {
    prismaMock.scheduleItem.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(jsonRequest("http://localhost/api/schedule/evt-1", "DELETE"), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.scheduleItem.deleteMany).toHaveBeenCalledWith({ where: { id: "evt-1", userId: "user-1" } });
  });
});

describe("POST /api/schedule/[id]/duplicate", () => {
  it("creates a copy owned by the same user, dropping recurrence/completion state", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({
      id: "evt-1",
      title: "Gym",
      notes: null,
      date: "2026-08-14",
      startTime: "17:00",
      endTime: "18:00",
      endDate: null,
      allDay: false,
      location: "Campus gym",
      category: "Exercise",
      reminderMinutesBefore: null,
      priority: "normal",
      subject: null,
      estimatedHours: null,
    });
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-2", title: "Gym" });

    const res = await DUPLICATE(jsonRequest("http://localhost/api/schedule/evt-1/duplicate", "POST"), {
      params: Promise.resolve({ id: "evt-1" }),
    });

    expect(res.status).toBe(201);
    expect(prismaMock.scheduleItem.findFirst).toHaveBeenCalledWith({ where: { id: "evt-1", userId: "user-1" } });
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1", title: "Gym", category: "Exercise" }) })
    );
    const created = prismaMock.scheduleItem.create.mock.calls[0][0].data;
    expect(created).not.toHaveProperty("recurrence");
    expect(created).not.toHaveProperty("completed");
  });

  it("404s when the original event doesn't exist (or isn't owned by this user)", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue(null);
    const res = await DUPLICATE(jsonRequest("http://localhost/api/schedule/missing/duplicate", "POST"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    expect(prismaMock.scheduleItem.create).not.toHaveBeenCalled();
  });
});
