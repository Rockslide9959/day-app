import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level test: exercises the Reminder/Timer sweep (existing, working
// behavior) and the new ScheduleItem reminder sweep side-by-side in the
// same tick, via the real /api/cron/tick handler.
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
  reminder: {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  timer: {
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
  prismaMock.reminder.findMany.mockResolvedValue([]);
  prismaMock.timer.findMany.mockResolvedValue([]);
  webpushMock.isPushConfigured.mockReturnValue(true);
  webpushMock.sendPush.mockResolvedValue(undefined);
});

describe("GET /api/cron/tick — response shape", () => {
  it("includes the new schedule-reminder counts alongside the existing ones", async () => {
    const res = await GET(tickRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      sent: 0,
      reminders: 0,
      timersSent: 0,
      timersTransitioned: 0,
      scheduleRemindersDue: 0,
      schedulePushesSent: 0,
      scheduleRetries: 0,
      scheduleSkippedCompleted: 0,
    });
  });

  it("rejects an unauthorized request without touching any model", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/tick?secret=wrong"));
    expect(res.status).toBe(401);
    expect(prismaMock.reminder.findMany).not.toHaveBeenCalled();
    expect(prismaMock.scheduleItem.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/tick — existing Reminder/Timer behavior is unaffected", () => {
  it("still sends a due regular Reminder and marks it notified", async () => {
    prismaMock.reminder.findMany.mockResolvedValue([
      { id: "rem-1", userId: "user-1", title: "Water plants", notes: null, dueAt: new Date(), recurrence: "none" },
    ]);
    addSubscription("user-1", "ep-1");

    const res = await GET(tickRequest());
    const body = await res.json();

    expect(body.sent).toBe(1);
    expect(body.reminders).toBe(1);
    expect(prismaMock.reminder.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { notified: true },
    });
  });

  it("still transitions a completed countdown timer and sends its push", async () => {
    const startedAt = new Date(Date.now() - 120_000);
    prismaMock.timer.findMany.mockResolvedValue([
      {
        id: "timer-1",
        userId: "user-1",
        mode: "countdown",
        status: "running",
        durationSeconds: 60,
        workSeconds: null,
        breakSeconds: null,
        phase: null,
        cyclesCompleted: 0,
        accumulatedSeconds: 0,
        startedAt,
        label: "Focus block",
      },
    ]);
    addSubscription("user-1", "ep-1");

    const res = await GET(tickRequest());
    const body = await res.json();

    expect(body.timersTransitioned).toBe(1);
    expect(body.timersSent).toBe(1);
    expect(prismaMock.timer.update).toHaveBeenCalled();
  });
});

describe("GET /api/cron/tick — schedule reminders run alongside the existing sweep", () => {
  it("delivers a due ScheduleItem reminder without disturbing Reminder/Timer counts", async () => {
    // A fixed clock so the ScheduleItem reminder below is deterministically
    // due (14:00 Africa/Johannesburg minus 30 min = 11:30 UTC).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T11:30:00.000Z"));
    try {
      prismaMock.reminder.findMany.mockResolvedValue([
        { id: "rem-1", userId: "user-1", title: "Water plants", notes: null, dueAt: new Date(), recurrence: "none" },
      ]);
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

      // The existing Reminder sweep still fired normally, side-by-side.
      expect(body.reminders).toBe(1);
      expect(body.sent).toBe(1);
      // ...and the new ScheduleItem reminder was also delivered, exactly once.
      expect(body.scheduleRemindersDue).toBe(1);
      expect(body.schedulePushesSent).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
