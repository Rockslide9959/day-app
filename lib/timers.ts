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

// Combines separate hours/minutes/seconds string inputs (each optional —
// blank is treated as 0) into a total duration in seconds.
// ("1", "30", "") -> 5400, ("", "", "45") -> 45, ("", "", "") -> null
export function parseDurationParts(
  hoursInput: string,
  minutesInput: string,
  secondsInput: string
): number | null {
  const values = [hoursInput, minutesInput, secondsInput].map((s) => {
    const trimmed = s.trim();
    return trimmed === "" ? 0 : Number(trimmed);
  });
  if (!values.every((n) => Number.isFinite(n) && n >= 0)) return null;
  const [hours, minutes, seconds] = values;
  const total = Math.round(hours * 3600 + minutes * 60 + seconds);
  return total > 0 ? total : null;
}
