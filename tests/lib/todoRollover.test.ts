import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Guards the to-do carry-over feature, which has silently stopped working
// more than once when it relied solely on the external cron. These cover the
// rollover logic itself plus the on-read path the API routes now call.
const prismaMock = vi.hoisted(() => ({
  user: { findMany: vi.fn(), update: vi.fn() },
  todo: { findMany: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  isPlausibleToday,
  processTodoRollover,
  rolloverTodosForUser,
  rolloverTodosOnRead,
} from "@/lib/todoRolloverCron";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.todo.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("rolloverTodosForUser", () => {
  it("moves unfinished past to-dos onto today and tags them on first roll", async () => {
    prismaMock.todo.findMany.mockResolvedValue([
      { id: "t1", title: "Buy milk", date: "2026-09-30", rolledOverFromDate: null },
    ]);

    const moved = await rolloverTodosForUser("u1", "2026-10-01");

    expect(moved).toBe(1);
    expect(prismaMock.todo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", completed: false, date: { lt: "2026-10-01" } } })
    );
    expect(prismaMock.todo.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        date: "2026-10-01",
        rolledOver: true,
        rolledOverFromDate: "2026-09-30",
        title: "Buy milk (from Sep 30)",
      },
    });
  });

  it("keeps the original title suffix and origin date on later rolls", async () => {
    prismaMock.todo.findMany.mockResolvedValue([
      { id: "t1", title: "Buy milk (from Sep 28)", date: "2026-09-30", rolledOverFromDate: "2026-09-28" },
    ]);

    await rolloverTodosForUser("u1", "2026-10-01");

    expect(prismaMock.todo.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        date: "2026-10-01",
        rolledOver: true,
        rolledOverFromDate: "2026-09-28",
        title: "Buy milk (from Sep 28)",
      },
    });
  });
});

describe("rolloverTodosOnRead", () => {
  const now = new Date("2026-10-01T10:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls over using the client's local date", async () => {
    prismaMock.todo.findMany.mockResolvedValue([
      { id: "t1", title: "Task", date: "2026-09-30", rolledOverFromDate: null },
    ]);
    await rolloverTodosOnRead("u1", "2026-10-01");
    expect(prismaMock.todo.update).toHaveBeenCalledTimes(1);
  });

  it("ignores a missing or implausible date", async () => {
    await rolloverTodosOnRead("u1", null);
    await rolloverTodosOnRead("u1", "not-a-date");
    await rolloverTodosOnRead("u1", "2027-01-01");
    expect(prismaMock.todo.findMany).not.toHaveBeenCalled();
  });

  it("never throws, so a DB hiccup can't break the to-do list", async () => {
    prismaMock.todo.findMany.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(rolloverTodosOnRead("u1", "2026-10-01")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("isPlausibleToday", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  it("accepts dates that are 'today' somewhere on Earth", () => {
    expect(isPlausibleToday("2026-10-01", now)).toBe(true);
  });
  it("rejects dates no timezone is on", () => {
    expect(isPlausibleToday("2026-09-29", now)).toBe(false);
    expect(isPlausibleToday("2026-10-03", now)).toBe(false);
  });
});

describe("processTodoRollover (cron backstop)", () => {
  it("keeps processing other users when one user's rollover fails", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "bad", todoReminderTimeZone: "Africa/Johannesburg", todoRolloverLastDate: null },
      { id: "good", todoReminderTimeZone: "Africa/Johannesburg", todoRolloverLastDate: null },
    ]);
    prismaMock.todo.findMany.mockImplementation(async ({ where }: { where: { userId: string } }) => {
      if (where.userId === "bad") throw new Error("boom");
      return [{ id: "t1", title: "Task", date: "2026-09-30", rolledOverFromDate: null }];
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processTodoRollover(new Date("2026-10-01T10:00:00Z"));

    expect(result).toEqual({ usersProcessed: 1, todosMoved: 1 });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "good" },
      data: { todoRolloverLastDate: "2026-10-01" },
    });
    spy.mockRestore();
  });

  it("skips users already rolled over today", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", todoReminderTimeZone: "Africa/Johannesburg", todoRolloverLastDate: "2026-10-01" },
    ]);
    await processTodoRollover(new Date("2026-10-01T10:00:00Z"));
    expect(prismaMock.todo.findMany).not.toHaveBeenCalled();
  });
});
