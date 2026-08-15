import { beforeEach, describe, expect, it, vi } from "vitest";

// A lightweight in-memory fake of the three models reminderCron.ts touches —
// realistic enough to exercise the upsert-then-claim-then-send flow across
// repeated calls (needed to prove duplicate prevention / retries), without
// needing a real database.
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
  subscriptions: new Map<string, FakeSubscription>(), // keyed by endpoint
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
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      for (const [key, sub] of store.subscriptions) {
        if (sub.id === where.id) store.subscriptions.delete(key);
      }
    }),
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
  sendPush: vi.fn(
    async (
      _sub: { endpoint: string; keys: { p256dh: string; auth: string } },
      _payload: { title: string; body?: string; url?: string }
    ) => {}
  ),
  isPushConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/webpush", () => webpushMock);

import { processScheduleReminders } from "@/lib/calendar/reminderCron";

const NOW = new Date("2026-08-15T11:30:00.000Z"); // due instant for the default item below

function addItem(overrides: Record<string, unknown> = {}) {
  const item = {
    id: "item-1",
    userId: "user-1",
    itemType: "event",
    title: "Lecture",
    date: "2026-08-15",
    startTime: "14:00", // 14:00 Africa/Johannesburg (UTC+2) = 12:00 UTC
    allDay: false,
    reminderMinutesBefore: 30, // due at 11:30 UTC = NOW
    completed: false,
    completedDates: "",
    recurrence: "none",
    recurrenceDays: null,
    recurrenceEndDate: null,
    timeZone: "Africa/Johannesburg",
    ...overrides,
  };
  store.scheduleItems.set(item.id as string, item);
  return item;
}

function addSubscription(userId: string, endpoint: string) {
  const sub = { id: `sub-${endpoint}`, userId, endpoint, p256dh: "p256dh", auth: "auth" };
  store.subscriptions.set(endpoint, sub);
  return sub;
}

beforeEach(() => {
  store.scheduleItems.clear();
  store.subscriptions.clear();
  store.deliveries.length = 0;
  store.idCounter = 0;
  vi.clearAllMocks();
  webpushMock.isPushConfigured.mockReturnValue(true);
  webpushMock.sendPush.mockResolvedValue(undefined);
});

describe("processScheduleReminders", () => {
  it("sends a push for an occurrence that just became due", async () => {
    addItem();
    addSubscription("user-1", "endpoint-a");

    const result = await processScheduleReminders(NOW);

    expect(result.due).toBe(1);
    expect(result.sent).toBe(1);
    expect(webpushMock.sendPush).toHaveBeenCalledTimes(1);
    const [, payload] = webpushMock.sendPush.mock.calls[0];
    expect(payload).toMatchObject({ title: "Upcoming event", body: "Lecture starts in 30 minutes" });
  });

  it("does not send twice across repeated cron calls for the same occurrence", async () => {
    addItem();
    addSubscription("user-1", "endpoint-a");

    await processScheduleReminders(NOW);
    const second = await processScheduleReminders(NOW);

    expect(webpushMock.sendPush).toHaveBeenCalledTimes(1);
    expect(second.sent).toBe(0);
    expect(second.due).toBe(1); // still recognized as due, but already delivered
  });

  it("delivers the same occurrence to two subscribed devices", async () => {
    addItem();
    addSubscription("user-1", "endpoint-a");
    addSubscription("user-1", "endpoint-b");

    const result = await processScheduleReminders(NOW);

    expect(result.sent).toBe(2);
    expect(webpushMock.sendPush).toHaveBeenCalledTimes(2);
  });

  it("a successful device isn't notified again when another device needs retrying", async () => {
    addItem();
    addSubscription("user-1", "endpoint-a");
    addSubscription("user-1", "endpoint-b");
    webpushMock.sendPush.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === "endpoint-b") throw new Error("temporary failure");
    });

    await processScheduleReminders(NOW);
    webpushMock.sendPush.mockClear();
    webpushMock.sendPush.mockResolvedValue(undefined);

    const second = await processScheduleReminders(new Date(NOW.getTime() + 60_000));
    expect(second.sent).toBe(1);
    expect(webpushMock.sendPush).toHaveBeenCalledTimes(1);
    expect(webpushMock.sendPush.mock.calls[0][0].endpoint).toBe("endpoint-b");
  });

  it("prunes an expired subscription (410) and stops retrying it", async () => {
    addItem();
    const sub = addSubscription("user-1", "endpoint-a");
    webpushMock.sendPush.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));

    const result = await processScheduleReminders(NOW);

    expect(result.sent).toBe(0);
    expect(prismaMock.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: sub.id } });
    expect(store.subscriptions.has("endpoint-a")).toBe(false);

    webpushMock.sendPush.mockClear();
    await processScheduleReminders(new Date(NOW.getTime() + 60_000));
    expect(webpushMock.sendPush).not.toHaveBeenCalled(); // no live subscription left to retry
  });

  it("retries a transient failure on the next tick without marking it sent", async () => {
    addItem();
    addSubscription("user-1", "endpoint-a");
    webpushMock.sendPush.mockRejectedValueOnce(new Error("network blip"));

    const first = await processScheduleReminders(NOW);
    expect(first.sent).toBe(0);

    webpushMock.sendPush.mockResolvedValue(undefined);
    const second = await processScheduleReminders(new Date(NOW.getTime() + 60_000));
    expect(second.sent).toBe(1);
    expect(second.retries).toBe(1);
  });

  it("does not mark a reminder delivered when there are zero subscriptions", async () => {
    addItem();
    const result = await processScheduleReminders(NOW);
    expect(result.due).toBe(1);
    expect(result.sent).toBe(0);
    expect(webpushMock.sendPush).not.toHaveBeenCalled();
  });

  it("does nothing when push isn't configured", async () => {
    webpushMock.isPushConfigured.mockReturnValue(false);
    addItem();
    addSubscription("user-1", "endpoint-a");

    const result = await processScheduleReminders(NOW);
    expect(result).toEqual({ due: 0, sent: 0, retries: 0, skippedCompleted: 0 });
    expect(prismaMock.scheduleItem.findMany).not.toHaveBeenCalled();
  });

  it("skips (and counts) a completed occurrence instead of sending", async () => {
    addItem({ completed: true });
    addSubscription("user-1", "endpoint-a");

    const result = await processScheduleReminders(NOW);
    expect(result.skippedCompleted).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("never sends for an item with reminderMinutesBefore: null", async () => {
    addItem({ reminderMinutesBefore: null });
    addSubscription("user-1", "endpoint-a");
    prismaMock.scheduleItem.findMany.mockImplementationOnce(async () => []); // mirrors the DB-level filter

    const result = await processScheduleReminders(NOW);
    expect(result.due).toBe(0);
    expect(result.sent).toBe(0);
  });

  it("sends a reminder up to the edge of the catch-up window (late delivery)", async () => {
    addItem();
    addSubscription("user-1", "endpoint-a");
    const tenMinutesLate = new Date(NOW.getTime() + 10 * 60_000);

    const result = await processScheduleReminders(tenMinutesLate);
    expect(result.sent).toBe(1);
  });

  it("does not send a reminder well past the catch-up window (stale/missed)", async () => {
    addItem();
    addSubscription("user-1", "endpoint-a");
    const wayLate = new Date(NOW.getTime() + 60 * 60_000); // 1 hour late

    const result = await processScheduleReminders(wayLate);
    expect(result.due).toBe(0);
    expect(result.sent).toBe(0);
  });

  it("only ever uses the item owner's own subscriptions", async () => {
    addItem({ userId: "user-1" });
    addSubscription("user-2", "endpoint-other-account");

    const result = await processScheduleReminders(NOW);
    expect(result.sent).toBe(0);
    expect(webpushMock.sendPush).not.toHaveBeenCalled();
  });
});
