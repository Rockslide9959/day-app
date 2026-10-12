import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level test: exercises todo rollover, the ScheduleItem reminder
// sweep and the daily to-do reminder side-by-side in the same tick, via the
// real /api/cron/tick handler.
type FakeScheduleItem = Record<string, unknown> & { id: string; userId: string };
type FakeSubscription = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };
type FakeDelivery = {
  id: string;
  scheduleItemId: string;
  occurrenceDate: string;
  reminderAt: Date;
  pushEndpoint: string;
  status: string;
  attempts: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
};

const store = vi.hoisted(() => ({
  scheduleItems: new Map<string, FakeScheduleItem>(),
  subscriptions: new Map<string, FakeSubscription>(),
  deliveries: [] as FakeDelivery[],
  idCounter: 0,
}));

// Minimal support for Prisma's `{ increment: n }` update operator, which a
// naive Object.assign would otherwise overwrite the field with verbatim.
function applyData(row: FakeDelivery, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    const isIncrement = value !== null && typeof value === "object" && "increment" in value;
    (row as Record<string, unknown>)[key] = isIncrement
      ? (row as unknown as Record<string, number>)[key] + (value as { increment: number }).increment
      : value;
  }
}

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  todo: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  scheduleItem: {
    findMany: vi.fn(async () => [...store.scheduleItems.values()]),
  },
  pushSubscription: {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      [...store.subscriptions.values()].filter((s) => s.userId === where.userId)
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { endpoint: string; userId: string } }) =>
        [...store.subscriptions.values()].find((s) => s.endpoint === where.endpoint && s.userId === where.userId) ||
        null
    ),
    delete: vi.fn(),
  },
  scheduleReminderDelivery: {
    upsert: vi.fn(
      async ({
        where,
        create,
      }: {
        where: { scheduleItemId_occurrenceDate_pushEndpoint: Pick<FakeDelivery, "scheduleItemId" | "occurrenceDate" | "pushEndpoint"> };
        create: Partial<FakeDelivery>;
      }) => {
        const key = where.scheduleItemId_occurrenceDate_pushEndpoint;
        let row = store.deliveries.find(
          (d) =>
            d.scheduleItemId === key.scheduleItemId &&
            d.occurrenceDate === key.occurrenceDate &&
            d.pushEndpoint === key.pushEndpoint
        );
        if (!row) {
          row = { id: `del-${++store.idCounter}`, attempts: 0, lastAttemptAt: null, sentAt: null, ...create } as FakeDelivery;
          store.deliveries.push(row);
        }
        return row;
      }
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { attempts: { lt: number }; OR: Array<{ status: string; lastAttemptAt?: { lt: Date } }> };
      }) => {
        return store.deliveries
          .filter((d) => {
            if (d.attempts >= where.attempts.lt) return false;
            return where.OR.some((clause) => {
              if (clause.status === "pending") return d.status === "pending";
              return d.status === "sending" && d.lastAttemptAt !== null && clause.lastAttemptAt !== undefined && d.lastAttemptAt < clause.lastAttemptAt.lt;
            });
          })
          .map((d) => ({ ...d, scheduleItem: store.scheduleItems.get(d.scheduleItemId) || null }));
      }
    ),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
      const row = store.deliveries.find((d) => d.id === where.id && d.status === where.status);
      if (!row) return { count: 0 };
      applyData(row, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = store.deliveries.find((d) => d.id === where.id);
      if (row) applyData(row, data);
      return row;
    }),
  },
}));

const webpushMock = vi.hoisted(() => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
  isPushConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/webpush", () => webpushMock);

import { GET } from "@/app/api/cron/tick/route";

function tickRequest() {
  return new NextRequest("http://localhost/api/cron/tick?secret=test-secret");
}

function addSubscription(userId: string, endpoint: string) {
  store.subscriptions.set(endpoint, { id: `sub-${endpoint}`, userId, endpoint, p256dh: "p", auth: "a" });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  store.scheduleItems.clear();
  store.subscriptions.clear();
  store.deliveries.length = 0;
  store.idCounter = 0;
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.todo.count.mockResolvedValue(0);
  prismaMock.todo.findMany.mockResolvedValue([]);
  // Restores the default store-backed behavior — a prior test's
  // mockRejectedValue/mockImplementation on this one otherwise survives
  // vi.clearAllMocks(), which only clears call history, not implementations.
  prismaMock.scheduleItem.findMany.mockImplementation(async () => [...store.scheduleItems.values()]);
  webpushMock.isPushConfigured.mockReturnValue(true);
  webpushMock.sendPush.mockResolvedValue(undefined);
});

describe("GET /api/cron/tick — response shape", () => {
  it("reports counts for every phase", async () => {
    const res = await GET(tickRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      todoRolloverUsers: 0,
      todoRolloverMoved: 0,
      scheduleRemindersDue: 0,
      schedulePushesSent: 0,
      scheduleRetries: 0,
      scheduleSkippedCompleted: 0,
      todoRemindersDue: 0,
      todoRemindersSent: 0,
    });
  });

  it("rejects an unauthorized request without touching any model", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/tick?secret=wrong"));
    expect(res.status).toBe(401);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.scheduleItem.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/tick — phase isolation", () => {
  it("still runs todo rollover and reports 200 when the schedule phase throws (e.g. a DB reconnect stall)", async () => {
    prismaMock.scheduleItem.findMany.mockRejectedValue(new Error("connection timeout"));
    // The rollover query has no `where` clause; the todoReminders query does
    // (`todoReminderEnabled: true`) — branch on that so this only feeds a
    // user into the rollover phase and leaves the unrelated todoReminders
    // phase with nothing to do.
    prismaMock.user.findMany.mockImplementation(async (args?: { where?: unknown }) => {
      if (args?.where) return [];
      return [{ id: "user-1", todoReminderTimeZone: "Africa/Johannesburg", todoRolloverLastDate: "2026-08-14" }];
    });
    prismaMock.todo.findMany.mockResolvedValue([
      { id: "todo-1", title: "Old task", date: "2026-08-14", rolledOverFromDate: null },
    ]);

    const res = await GET(tickRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.errors).toEqual(["schedule"]);
    // Rollover ran normally even though the schedule phase blew up.
    expect(body.todoRolloverUsers).toBe(1);
    expect(body.todoRolloverMoved).toBe(1);
    expect(prismaMock.todo.update).toHaveBeenCalled();
    // The failed phase falls back to zeroed counts instead of taking the whole response down.
    expect(body.scheduleRemindersDue).toBe(0);
    expect(body.schedulePushesSent).toBe(0);
  });

  it("returns 500 only when every phase fails", async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error("db down"));
    prismaMock.scheduleItem.findMany.mockRejectedValue(new Error("db down"));

    const res = await GET(tickRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errors).toEqual(expect.arrayContaining(["todoRollover", "schedule", "todoReminders"]));
  });
});

describe("GET /api/cron/tick — schedule reminders", () => {
  it("delivers a due ScheduleItem reminder exactly once", async () => {
    // A fixed clock so the ScheduleItem reminder below is deterministically
    // due (14:00 Africa/Johannesburg minus 30 min = 11:30 UTC).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T11:30:00.000Z"));
    try {
      addSubscription("user-1", "ep-1");

      store.scheduleItems.set("item-1", {
        id: "item-1",
        userId: "user-1",
        itemType: "event",
        title: "Standup",
        date: "2026-08-15",
        startTime: "14:00",
        allDay: false,
        reminderMinutesBefore: 30,
        completed: false,
        completedDates: "",
        recurrence: "none",
        recurrenceDays: null,
        recurrenceEndDate: null,
        timeZone: "Africa/Johannesburg",
      });

      const res = await GET(tickRequest());
      const body = await res.json();

      expect(body.scheduleRemindersDue).toBe(1);
      expect(body.schedulePushesSent).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GET /api/cron/tick — daily to-do reminder", () => {
  // 2026-08-15T19:00:00Z is 21:00 in Africa/Johannesburg (UTC+2, no DST) —
  // past a 20:00 reminder time on the same local calendar day.
  const PAST_REMINDER_TIME = new Date("2026-08-15T19:00:00.000Z");

  it("sends a push and stamps today's date once the reminder time has passed with open to-dos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAST_REMINDER_TIME);
    try {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          todoReminderTime: "20:00",
          todoReminderTimeZone: "Africa/Johannesburg",
          todoReminderLastSentDate: null,
          todoRolloverLastDate: "2026-08-15",
        },
      ]);
      prismaMock.todo.count.mockResolvedValue(2);
      addSubscription("user-1", "ep-1");

      const res = await GET(tickRequest());
      const body = await res.json();

      expect(body.todoRemindersDue).toBe(1);
      expect(body.todoRemindersSent).toBe(1);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { todoReminderLastSentDate: "2026-08-15" },
      });
      expect(webpushMock.sendPush).toHaveBeenCalledWith(
        { endpoint: "ep-1", keys: { p256dh: "p", auth: "a" } },
        expect.objectContaining({ title: "Wrap up your day", body: "You still have 2 to-dos left today." })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("stamps the date but sends nothing when every to-do is already complete", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAST_REMINDER_TIME);
    try {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          todoReminderTime: "20:00",
          todoReminderTimeZone: "Africa/Johannesburg",
          todoReminderLastSentDate: null,
          todoRolloverLastDate: "2026-08-15",
        },
      ]);
      prismaMock.todo.count.mockResolvedValue(0);
      addSubscription("user-1", "ep-1");

      const res = await GET(tickRequest());
      const body = await res.json();

      expect(body.todoRemindersDue).toBe(1);
      expect(body.todoRemindersSent).toBe(0);
      expect(webpushMock.sendPush).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not re-notify a user already stamped for today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAST_REMINDER_TIME);
    try {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          todoReminderTime: "20:00",
          todoReminderTimeZone: "Africa/Johannesburg",
          todoReminderLastSentDate: "2026-08-15",
          todoRolloverLastDate: "2026-08-15",
        },
      ]);
      prismaMock.todo.count.mockResolvedValue(5);
      addSubscription("user-1", "ep-1");

      const res = await GET(tickRequest());
      const body = await res.json();

      expect(body.todoRemindersDue).toBe(0);
      expect(body.todoRemindersSent).toBe(0);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(webpushMock.sendPush).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire before the configured reminder time", async () => {
    vi.useFakeTimers();
    // 15:00Z = 17:00 local — still before a 20:00 reminder time.
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));
    try {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          todoReminderTime: "20:00",
          todoReminderTimeZone: "Africa/Johannesburg",
          todoReminderLastSentDate: null,
          todoRolloverLastDate: "2026-08-15",
        },
      ]);
      prismaMock.todo.count.mockResolvedValue(3);
      addSubscription("user-1", "ep-1");

      const res = await GET(tickRequest());
      const body = await res.json();

      expect(body.todoRemindersDue).toBe(0);
      expect(body.todoRemindersSent).toBe(0);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(webpushMock.sendPush).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
