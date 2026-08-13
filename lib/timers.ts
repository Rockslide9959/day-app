export type TimerState = {
  mode: string; // "stopwatch" | "countdown" | "pomodoro"
  status: string; // "running" | "paused" | "completed"
  durationSeconds: number | null;
  workSeconds: number | null;
  breakSeconds: number | null;
  phase: string | null; // "work" | "break" — pomodoro only
  accumulatedSeconds: number;
  startedAt: string | null; // ISO timestamp
};

// Total seconds this timer has run, including the current in-progress
// segment if it's running. For a pomodoro this is scoped to the current
// phase — accumulatedSeconds resets to 0 each time the phase switches.
export function elapsedSeconds(timer: TimerState, nowMs: number): number {
  if (timer.status === "running" && timer.startedAt) {
    const runningFor = Math.max(0, (nowMs - new Date(timer.startedAt).getTime()) / 1000);
    return timer.accumulatedSeconds + runningFor;
  }
  return timer.accumulatedSeconds;
}

// Duration of the segment currently in progress: the countdown target,
// or whichever pomodoro phase (work/break) is active. Null for a
// stopwatch, which has no fixed duration.
export function phaseDurationSeconds(timer: TimerState): number | null {
  if (timer.mode === "countdown") return timer.durationSeconds;
  if (timer.mode === "pomodoro") return timer.phase === "break" ? timer.breakSeconds : timer.workSeconds;
  return null;
}

// Seconds left in the current segment; 0 for a stopwatch or once expired.
export function remainingSeconds(timer: TimerState, nowMs: number): number {
  const duration = phaseDurationSeconds(timer);
  if (duration == null) return 0;
  return Math.max(0, duration - elapsedSeconds(timer, nowMs));
}

// True once the current segment (a countdown, or a pomodoro work/break
// phase) has run out while still marked running.
export function isPhaseComplete(timer: TimerState, nowMs: number): boolean {
  const duration = phaseDurationSeconds(timer);
  if (duration == null) return false;
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
