export type Timer = {
  id: string;
  label: string;
  // "stopwatch" | "countdown" | "pomodoro"
  mode: string;
  // "running" | "paused" | "completed"
  status: string;
  durationSeconds: number | null;
  // Pomodoro work/break interval lengths, in seconds — null otherwise.
  workSeconds: number | null;
  breakSeconds: number | null;
  // "work" | "break" — pomodoro only.
  phase: string | null;
  // Completed work intervals — pomodoro only.
  cyclesCompleted: number;
  accumulatedSeconds: number;
  startedAt: string | null;
  linkedType: string | null;
  linkedId: string | null;
};
