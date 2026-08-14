import { describe, expect, it } from "vitest";
import {
  autoTransitionData,
  elapsedSeconds,
  formatClock,
  isPhaseComplete,
  parseDurationParts,
  phaseDurationSeconds,
  remainingSeconds,
  TimerState,
} from "@/lib/timers";

const BASE = new Date("2026-08-13T10:00:00.000Z").getTime();

function timer(overrides: Partial<TimerState>): TimerState {
  return {
    mode: "stopwatch",
    status: "running",
    durationSeconds: null,
    workSeconds: null,
    breakSeconds: null,
    phase: null,
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

describe("phaseDurationSeconds", () => {
  it("is durationSeconds for a countdown", () => {
    expect(phaseDurationSeconds(timer({ mode: "countdown", durationSeconds: 60 }))).toBe(60);
  });

  it("is workSeconds during a pomodoro's work phase", () => {
    expect(
      phaseDurationSeconds(timer({ mode: "pomodoro", phase: "work", workSeconds: 1500, breakSeconds: 300 }))
    ).toBe(1500);
  });

  it("is breakSeconds during a pomodoro's break phase", () => {
    expect(
      phaseDurationSeconds(timer({ mode: "pomodoro", phase: "break", workSeconds: 1500, breakSeconds: 300 }))
    ).toBe(300);
  });

  it("is null for a stopwatch", () => {
    expect(phaseDurationSeconds(timer({ mode: "stopwatch" }))).toBeNull();
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

  it("counts down the active pomodoro phase", () => {
    const work = timer({ mode: "pomodoro", phase: "work", workSeconds: 1500, breakSeconds: 300 });
    expect(remainingSeconds(work, BASE + 100_000)).toBe(1400);

    const brk = timer({ mode: "pomodoro", phase: "break", workSeconds: 1500, breakSeconds: 300 });
    expect(remainingSeconds(brk, BASE + 100_000)).toBe(200);
  });

  it("is always zero for a stopwatch", () => {
    const t = timer({ mode: "stopwatch", accumulatedSeconds: 500 });
    expect(remainingSeconds(t, BASE + 10_000)).toBe(0);
  });
});

describe("isPhaseComplete", () => {
  it("is true once a running countdown hits zero", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60 });
    expect(isPhaseComplete(t, BASE + 60_000)).toBe(true);
  });

  it("is false before expiry", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60 });
    expect(isPhaseComplete(t, BASE + 30_000)).toBe(false);
  });

  it("is false once already marked completed (no repeat firing)", () => {
    const t = timer({ mode: "countdown", durationSeconds: 60, status: "completed", startedAt: null, accumulatedSeconds: 60 });
    expect(isPhaseComplete(t, BASE + 90_000)).toBe(false);
  });

  it("is true once a running pomodoro work phase runs out", () => {
    const t = timer({ mode: "pomodoro", phase: "work", workSeconds: 1500, breakSeconds: 300 });
    expect(isPhaseComplete(t, BASE + 1500_000)).toBe(true);
  });

  it("is true once a running pomodoro break phase runs out", () => {
    const t = timer({ mode: "pomodoro", phase: "break", workSeconds: 1500, breakSeconds: 300 });
    expect(isPhaseComplete(t, BASE + 300_000)).toBe(true);
  });

  it("is false for a paused pomodoro even past its phase duration", () => {
    const t = timer({ mode: "pomodoro", phase: "work", workSeconds: 60, status: "paused", accumulatedSeconds: 90, startedAt: null });
    expect(isPhaseComplete(t, BASE)).toBe(false);
  });

  it("is false for a stopwatch regardless of elapsed time", () => {
    const t = timer({ mode: "stopwatch", accumulatedSeconds: 99999 });
    expect(isPhaseComplete(t, BASE + 90_000)).toBe(false);
  });
});

describe("autoTransitionData", () => {
  function timerWithCycles(overrides: Partial<TimerState> & { cyclesCompleted?: number }) {
    return { ...timer(overrides), cyclesCompleted: overrides.cyclesCompleted ?? 0 };
  }

  it("is null before a running countdown expires", () => {
    const t = timerWithCycles({ mode: "countdown", durationSeconds: 60 });
    expect(autoTransitionData(t, new Date(BASE + 30_000))).toBeNull();
  });

  it("marks a countdown completed once it expires, banking the full duration", () => {
    const t = timerWithCycles({ mode: "countdown", durationSeconds: 60 });
    expect(autoTransitionData(t, new Date(BASE + 60_000))).toEqual({
      status: "completed",
      startedAt: null,
      accumulatedSeconds: 60,
    });
  });

  it("is null for an already-completed countdown — no repeat transition/notification", () => {
    const t = timerWithCycles({
      mode: "countdown",
      durationSeconds: 60,
      status: "completed",
      startedAt: null,
      accumulatedSeconds: 60,
    });
    expect(autoTransitionData(t, new Date(BASE + 120_000))).toBeNull();
  });

  it("flips a finished pomodoro work phase to break and bumps the round count", () => {
    const t = timerWithCycles({
      mode: "pomodoro",
      phase: "work",
      workSeconds: 1500,
      breakSeconds: 300,
      cyclesCompleted: 2,
    });
    const now = new Date(BASE + 1500_000);
    expect(autoTransitionData(t, now)).toEqual({
      phase: "break",
      cyclesCompleted: 3,
      accumulatedSeconds: 0,
      startedAt: now,
      status: "running",
    });
  });

  it("flips a finished pomodoro break phase back to work without bumping the round count", () => {
    const t = timerWithCycles({
      mode: "pomodoro",
      phase: "break",
      workSeconds: 1500,
      breakSeconds: 300,
      cyclesCompleted: 3,
    });
    const now = new Date(BASE + 300_000);
    expect(autoTransitionData(t, now)).toEqual({
      phase: "work",
      cyclesCompleted: 3,
      accumulatedSeconds: 0,
      startedAt: now,
      status: "running",
    });
  });

  it("is null once a client or the cron sweep has already applied the transition (idempotent)", () => {
    // Simulates the race this exists to prevent: two callers read the same
    // "just expired" row, the first one's transition is applied, and the
    // second must see it's no longer complete and do nothing.
    const t = timerWithCycles({ mode: "pomodoro", phase: "work", workSeconds: 1500, breakSeconds: 300 });
    const now = new Date(BASE + 1500_000);
    const applied = autoTransitionData(t, now);
    expect(applied).not.toBeNull();
    const afterTransition = { ...t, ...applied };
    expect(autoTransitionData(afterTransition, now)).toBeNull();
  });

  it("is null for a stopwatch regardless of elapsed time", () => {
    const t = timerWithCycles({ mode: "stopwatch", accumulatedSeconds: 99999 });
    expect(autoTransitionData(t, new Date(BASE + 999_000))).toBeNull();
  });

  it("is null for a paused timer even past its duration", () => {
    const t = timerWithCycles({
      mode: "countdown",
      durationSeconds: 60,
      status: "paused",
      accumulatedSeconds: 90,
      startedAt: null,
    });
    expect(autoTransitionData(t, new Date(BASE))).toBeNull();
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
