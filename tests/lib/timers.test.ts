import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  formatClock,
  isCountdownComplete,
  parseDurationParts,
  remainingSeconds,
  TimerState,
} from "@/lib/timers";

const BASE = new Date("2026-08-13T10:00:00.000Z").getTime();

function timer(overrides: Partial<TimerState>): TimerState {
  return {
    mode: "stopwatch",
    status: "running",
    durationSeconds: null,
    accumulatedSeconds: 0,
    startedAt: new Date(BASE).toISOString(),
    ...overrides,
  };
}

describe("elapsedSeconds", () => {
  it("adds the running segment to accumulated time while running", () => {
    const t = timer({ accumulatedSeconds: 30 });
    expect(elapsedSeconds(t, BASE + 10_000)).toBe(40);
  });

  it("returns just the accumulated time when paused", () => {
    const t = timer({ status: "paused", accumulatedSeconds: 45, startedAt: null });
    expect(elapsedSeconds(t, BASE + 10_000)).toBe(45);
  });

  it("ignores a null startedAt even if status says running", () => {
    const t = timer({ status: "running", accumulatedSeconds: 12, startedAt: null });
    expect(elapsedSeconds(t, BASE + 5_000)).toBe(12);
  });
});

describe("remainingSeconds", () => {
  it("counts down from durationSeconds for a running countdown", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60, accumulatedSeconds: 0 });
    expect(remainingSeconds(t, BASE + 20_000)).toBe(40);
  });

  it("clamps at zero once expired", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60, accumulatedSeconds: 0 });
    expect(remainingSeconds(t, BASE + 90_000)).toBe(0);
  });

  it("is always zero for a stopwatch", () => {
    const t = timer({ mode: "stopwatch", accumulatedSeconds: 500 });
    expect(remainingSeconds(t, BASE + 10_000)).toBe(0);
  });
});

describe("isCountdownComplete", () => {
  it("is true once a running countdown hits zero", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60 });
    expect(isCountdownComplete(t, BASE + 60_000)).toBe(true);
  });

  it("is false before expiry", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60 });
    expect(isCountdownComplete(t, BASE + 30_000)).toBe(false);
  });

  it("is false once already marked completed (no repeat firing)", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60, status: "completed", startedAt: null, accumulatedSeconds: 60 });
    expect(isCountdownComplete(t, BASE + 90_000)).toBe(false);
  });

  it("is false for a stopwatch regardless of elapsed time", () => {
    const t = timer({ mode: "stopwatch", accumulatedSeconds: 99999 });
    expect(isCountdownComplete(t, BASE + 90_000)).toBe(false);
  });
});

describe("formatClock", () => {
  it("formats sub-hour durations as M:SS", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(0)).toBe("0:00");
  });

  it("formats hour-plus durations as H:MM:SS", () => {
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(3600)).toBe("1:00:00");
  });

  it("rounds and never goes negative", () => {
    expect(formatClock(59.6)).toBe("1:00");
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("parseDurationParts", () => {
  it("combines hours, minutes, and seconds into a total", () => {
    expect(parseDurationParts("1", "30", "0")).toBe(5400);
    expect(parseDurationParts("0", "0", "45")).toBe(45);
    expect(parseDurationParts("2", "0", "0")).toBe(7200);
  });

  it("treats blank fields as zero", () => {
    expect(parseDurationParts("", "5", "")).toBe(300);
    expect(parseDurationParts("1", "", "")).toBe(3600);
  });

  it("allows minutes/seconds over 59 and just sums the total", () => {
    expect(parseDurationParts("0", "90", "0")).toBe(5400);
    expect(parseDurationParts("0", "0", "125")).toBe(125);
  });

  it("rejects when every field is blank or the total is zero", () => {
    expect(parseDurationParts("", "", "")).toBeNull();
    expect(parseDurationParts("0", "0", "0")).toBeNull();
  });

  it("rejects negative or non-numeric input in any field", () => {
    expect(parseDurationParts("-1", "0", "0")).toBeNull();
    expect(parseDurationParts("0", "-1", "0")).toBeNull();
    expect(parseDurationParts("0", "0", "-1")).toBeNull();
    expect(parseDurationParts("abc", "0", "0")).toBeNull();
  });
});
