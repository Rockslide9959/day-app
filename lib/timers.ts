export type TimerState = {
  mode: string; // "stopwatch" | "countdown"
  status: string; // "running" | "paused" | "completed"
  durationSeconds: number | null;
  accumulatedSeconds: number;
  startedAt: string | null; // ISO timestamp
};

// Total seconds this timer has run, including the current in-progress
// segment if it's running.
export function elapsedSeconds(timer: TimerState, nowMs: number): number {
  if (timer.status === "running" && timer.startedAt) {
    const runningFor = Math.max(0, (nowMs - new Date(timer.startedAt).getTime()) / 1000);
    return timer.accumulatedSeconds + runningFor;
  }
  return timer.accumulatedSeconds;
}

// Seconds left on a countdown timer; 0 for stopwatches or once expired.
export function remainingSeconds(timer: TimerState, nowMs: number): number {
  if (timer.mode !== "countdown" || timer.durationSeconds == null) return 0;
  return Math.max(0, timer.durationSeconds - elapsedSeconds(timer, nowMs));
}

export function isCountdownComplete(timer: TimerState, nowMs: number): boolean {
  if (timer.mode !== "countdown" || timer.durationSeconds == null) return false;
  return timer.status === "running" && remainingSeconds(timer, nowMs) <= 0;
}

// 65 -> "1:05", 3725 -> "1:02:05"
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// "25" -> 1500, "1.5" -> 90, "" / "0" / "-5" / "abc" -> null
export function parseMinutesToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60);
}
