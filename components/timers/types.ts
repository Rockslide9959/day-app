export type Timer = {
  id: string;
  label: string;
  // "stopwatch" | "countdown"
  mode: string;
  // "running" | "paused" | "completed"
  status: string;
  durationSeconds: number | null;
  accumulatedSeconds: number;
  startedAt: string | null;
  linkedType: string | null;
  linkedId: string | null;
};
