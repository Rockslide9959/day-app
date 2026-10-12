import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level test: exercises todo rollover and the daily to-do reminder
// side-by-side in the same tick, via the real /api/cron/tick handler.
type FakeSubscription = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

const store = vi.hoisted(() => ({
  subscriptions: new Map<string, FakeSubscription>(),
}));

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
  store.subscriptions.clear();
  vi.clearAllMocks();
  // mockResolvedValue/mockImplementation from a prior test otherwise survive
  // vi.clearAllMocks(), which only clears call history, not implementations.
  prismaMock.user.findMany.mockReset();
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.todo.count.mockResolvedValue(0);
  prismaMock.todo.findMany.mockResolvedValue([]);
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
      todoRemindersDue: 0,
      todoRemindersSent: 0,
    });
  });

  it("rejects an unauthorized request without touching any model", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/tick?secret=wrong"));
    expect(res.status).toBe(401);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.todo.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/tick — phase isolation", () => {
  it("still runs todo rollover and reports 200 when the todoReminders phase throws (e.g. a DB reconnect stall)", async () => {
    // The rollover query has no `where` clause; the todoReminders query does
    // (`todoReminderEnabled: true`) — branch on that so only the
    // todoReminders phase blows up while rollover gets a user to process.
    prismaMock.user.findMany.mockImplementation(async (args?: { where?: unknown }) => {
      if (args?.where) throw new Error("connection timeout");
      return [{ id: "user-1", todoReminderTimeZone: "Africa/Johannesburg", todoRolloverLastDate: "2026-08-14" }];
    });
    prismaMock.todo.findMany.mockResolvedValue([
      { id: "todo-1", title: "Old task", date: "2026-08-14", rolledOverFromDate: null },
    ]);

    const res = await GET(tickRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.errors).toEqual(["todoReminders"]);
    // Rollover ran normally even though the todoReminders phase blew up.
    expect(body.todoRolloverUsers).toBe(1);
    expect(body.todoRolloverMoved).toBe(1);
    expect(prismaMock.todo.update).toHaveBeenCalled();
    // The failed phase falls back to zeroed counts instead of taking the whole response down.
    expect(body.todoRemindersDue).toBe(0);
    expect(body.todoRemindersSent).toBe(0);
  });

  it("returns 500 only when every phase fails", async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error("db down"));

    const res = await GET(tickRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errors).toEqual(expect.arrayContaining(["todoRollover", "todoReminders"]));
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
