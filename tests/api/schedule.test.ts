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
  scheduleReminderDelivery: {
    deleteMany: vi.fn(),
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

describe("POST /api/schedule — timezone", () => {
  it("stores a valid IANA timezone as sent by the client", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-1" });
    await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        title: "Dentist",
        date: "2026-08-14",
        startTime: "10:00",
        endTime: "11:00",
        timeZone: "America/New_York",
      })
    );
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ timeZone: "America/New_York" }) })
    );
  });

  it("falls back to the default timezone when missing or invalid", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-1" });
    await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        title: "Dentist",
        date: "2026-08-14",
        startTime: "10:00",
        endTime: "11:00",
        timeZone: "Not/AZone",
      })
    );
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ timeZone: "Africa/Johannesburg" }) })
    );
  });
});

describe("POST /api/schedule — itemType", () => {
  it("defaults itemType to \"event\" when omitted", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-1" });
    await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        title: "Dentist",
        date: "2026-08-14",
        startTime: "10:00",
        endTime: "11:00",
      })
    );
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ itemType: "event" }) })
    );
  });

  it("creates a task, deriving allDay + safe internal times when no due time is given", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "task-1" });
    await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        itemType: "task",
        title: "Submit report",
        date: "2026-08-20",
        category: "Assignment",
      })
    );
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemType: "task",
          date: "2026-08-20",
          endDate: "2026-08-20",
          startTime: "00:00",
          endTime: "23:59",
          allDay: true,
          location: null,
        }),
      })
    );
  });

  it("creates a task with a due time as a single-instant startTime===endTime, allDay:false", async () => {
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "task-2" });
    await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        itemType: "task",
        title: "Submit report",
        date: "2026-08-20",
        startTime: "17:00",
      })
    );
    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemType: "task",
          startTime: "17:00",
          endTime: "17:00",
          allDay: false,
        }),
      })
    );
  });

  it("rejects an invalid itemType with 400 without touching the database", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/schedule", "POST", {
        itemType: "reminder",
        title: "Bogus",
        date: "2026-08-20",
      })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.scheduleItem.create).not.toHaveBeenCalled();
  });

  it("rejects a task missing a due date", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/schedule", "POST", { itemType: "task", title: "No date" })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.scheduleItem.create).not.toHaveBeenCalled();
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

  it("preserves itemType on every occurrence of a recurring task", async () => {
    prismaMock.scheduleItem.findMany.mockResolvedValue([
      {
        id: "task-master",
        itemType: "task",
        title: "Weekly reflection",
        notes: null,
        date: "2026-08-03",
        startTime: "18:00",
        endTime: "18:00",
        endDate: "2026-08-03",
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
    const req2 = new NextRequest("http://localhost/api/schedule?from=2026-08-01&to=2026-08-17");
    const res = await GET(req2);
    const body = await res.json();

    expect(body.every((e: { itemType: string }) => e.itemType === "task")).toBe(true);
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

  it("updates a task's due date/title like any other field", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "task-1", itemType: "task", title: "Renamed" });

    const res = await PATCH(
      jsonRequest("http://localhost/api/schedule/task-1", "PATCH", { title: "Renamed", date: "2026-08-21" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(200);
    expect(prismaMock.scheduleItem.updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", userId: "user-1" },
      data: { title: "Renamed", date: "2026-08-21" },
    });
  });

  it("converts an event to a task, collapsing to a single-day due instant and clearing location", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "evt-1", itemType: "task" });

    await PATCH(
      jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", {
        itemType: "task",
        date: "2026-08-20",
        startTime: "17:00",
        endTime: "18:00",
        endDate: "2026-08-22",
        allDay: false,
        location: "Room 4",
      }),
      { params: Promise.resolve({ id: "evt-1" }) }
    );

    const data = prismaMock.scheduleItem.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({
      itemType: "task",
      date: "2026-08-20",
      endDate: "2026-08-20",
      startTime: "17:00",
      endTime: "17:00",
      location: null,
    });
  });

  it("converts a task to an event, leaving whatever start/end range the client sends", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "task-1", itemType: "event" });

    await PATCH(
      jsonRequest("http://localhost/api/schedule/task-1", "PATCH", {
        itemType: "event",
        date: "2026-08-20",
        startTime: "17:00",
        endTime: "18:00",
        endDate: "2026-08-20",
        allDay: false,
      }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    const data = prismaMock.scheduleItem.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ itemType: "event", startTime: "17:00", endTime: "18:00" });
  });

  it("rejects converting to a task without a due date, without touching the database", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { itemType: "task" }),
      { params: Promise.resolve({ id: "evt-1" }) }
    );
    expect(res.status).toBe(400);
    expect(prismaMock.scheduleItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid itemType on update, without touching the database", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { itemType: "reminder" }),
      { params: Promise.resolve({ id: "evt-1" }) }
    );
    expect(res.status).toBe(400);
    expect(prismaMock.scheduleItem.updateMany).not.toHaveBeenCalled();
  });

  it("sets completedAt when a non-recurring task is completed, and clears it on reopen", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "task-1" });

    await PATCH(jsonRequest("http://localhost/api/schedule/task-1", "PATCH", { completed: true }), {
      params: Promise.resolve({ id: "task-1" }),
    });
    let data = prismaMock.scheduleItem.updateMany.mock.calls[0][0].data;
    expect(data.completed).toBe(true);
    expect(data.completedAt).toBeInstanceOf(Date);

    await PATCH(jsonRequest("http://localhost/api/schedule/task-1", "PATCH", { completed: false }), {
      params: Promise.resolve({ id: "task-1" }),
    });
    data = prismaMock.scheduleItem.updateMany.mock.calls[1][0].data;
    expect(data.completed).toBe(false);
    expect(data.completedAt).toBeNull();
  });

  it("completing one occurrence of a recurring task only touches completedDates, not completed/completedAt", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({ id: "task-1", completedDates: "" });
    prismaMock.scheduleItem.update.mockResolvedValue({ id: "task-1", completedDates: "2026-08-10" });

    await PATCH(
      jsonRequest("http://localhost/api/schedule/task-1", "PATCH", { toggleCompletedDate: "2026-08-10" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(prismaMock.scheduleItem.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { completedDates: "2026-08-10" },
    });
  });
});

describe("PATCH /api/schedule/[id] — reminder cancellation", () => {
  it("cancels pending reminder deliveries when a reschedule-relevant field changes", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "evt-1" });

    await PATCH(jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { startTime: "15:00" }), {
      params: Promise.resolve({ id: "evt-1" }),
    });

    expect(prismaMock.scheduleReminderDelivery.deleteMany).toHaveBeenCalledWith({
      where: { scheduleItemId: "evt-1", status: { in: ["pending", "sending"] } },
    });
  });

  it("cancels pending reminders when the reminder is changed to 'No reminder'", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "evt-1" });

    await PATCH(jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { reminderMinutesBefore: null }), {
      params: Promise.resolve({ id: "evt-1" }),
    });

    expect(prismaMock.scheduleReminderDelivery.deleteMany).toHaveBeenCalledWith({
      where: { scheduleItemId: "evt-1", status: { in: ["pending", "sending"] } },
    });
  });

  it("cancels pending reminders outright when a non-recurring item is completed", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "task-1" });

    await PATCH(jsonRequest("http://localhost/api/schedule/task-1", "PATCH", { completed: true }), {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(prismaMock.scheduleReminderDelivery.deleteMany).toHaveBeenCalledWith({
      where: { scheduleItemId: "task-1", status: { in: ["pending", "sending"] } },
    });
  });

  it("does not touch reminder deliveries when only an unrelated field (title) changes", async () => {
    prismaMock.scheduleItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduleItem.findUnique.mockResolvedValue({ id: "evt-1" });

    await PATCH(jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { title: "Renamed" }), {
      params: Promise.resolve({ id: "evt-1" }),
    });

    expect(prismaMock.scheduleReminderDelivery.deleteMany).not.toHaveBeenCalled();
  });

  it("toggling one occurrence's completion cancels only that occurrence's pending reminder", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({ id: "evt-1", completedDates: "" });
    prismaMock.scheduleItem.update.mockResolvedValue({ id: "evt-1", completedDates: "2026-08-10" });

    await PATCH(
      jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { toggleCompletedDate: "2026-08-10" }),
      { params: Promise.resolve({ id: "evt-1" }) }
    );

    expect(prismaMock.scheduleReminderDelivery.deleteMany).toHaveBeenCalledWith({
      where: { scheduleItemId: "evt-1", status: { in: ["pending", "sending"] }, occurrenceDate: "2026-08-10" },
    });
  });

  it("un-completing an occurrence (toggle off) doesn't cancel any reminder", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({ id: "evt-1", completedDates: "2026-08-10" });
    prismaMock.scheduleItem.update.mockResolvedValue({ id: "evt-1", completedDates: "" });

    await PATCH(
      jsonRequest("http://localhost/api/schedule/evt-1", "PATCH", { toggleCompletedDate: "2026-08-10" }),
      { params: Promise.resolve({ id: "evt-1" }) }
    );

    expect(prismaMock.scheduleReminderDelivery.deleteMany).not.toHaveBeenCalled();
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
      itemType: "event",
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
    expect(created.itemType).toBe("event");
  });

  it("carries the original's timeZone over verbatim", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({
      id: "evt-1",
      itemType: "event",
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
      timeZone: "America/New_York",
    });
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "evt-2" });

    await DUPLICATE(jsonRequest("http://localhost/api/schedule/evt-1/duplicate", "POST"), {
      params: Promise.resolve({ id: "evt-1" }),
    });

    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ timeZone: "America/New_York" }) })
    );
  });

  it("preserves itemType: \"task\" when duplicating a task", async () => {
    prismaMock.scheduleItem.findFirst.mockResolvedValue({
      id: "task-1",
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
    });
    prismaMock.scheduleItem.create.mockResolvedValue({ id: "task-2", itemType: "task" });

    await DUPLICATE(jsonRequest("http://localhost/api/schedule/task-1/duplicate", "POST"), {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(prismaMock.scheduleItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ itemType: "task" }) })
    );
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
