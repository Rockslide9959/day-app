// Shared shapes for Quick Add (components/quickAdd, app/api/quick-add).
// Both interpreters — the offline rule-based parser (parse.ts) and the
// Claude-backed one (ai.ts) — produce QuickAction[], which execute.ts then
// carries out. Keeping one action vocabulary means the preview, the AI and
// the executor can never drift apart.

export type Recurrence = "none" | "daily" | "weekly" | "weekdays" | "monthly" | "custom";

export type EventAction = {
  kind: "event";
  title: string;
  date: string;
  startTime: string | null; // null = all day
  endTime: string | null;
  endDate: string | null;
  location: string | null;
  category: string | null;
  priority: "normal" | "high" | "urgent";
  recurrence: Recurrence;
  recurrenceDays: string | null; // "1,3" for Mon/Wed, used by weekly/custom
  notes: string | null;
};

export type TaskAction = {
  kind: "task";
  title: string;
  date: string;
  dueTime: string | null; // null = due any time that day
  category: string | null;
  priority: "normal" | "high" | "urgent";
  notes: string | null;
};

export type TodoAction = { kind: "todo"; title: string; date: string };

export type TodoCompleteAction = { kind: "todo_complete"; todoId: string; title: string };

export type HabitCreateAction = {
  kind: "habit_create";
  name: string;
  emoji: string;
  color: string;
  target: number;
  unit: string | null;
  days: string; // "" = every day
};

export type HabitLogAction = {
  kind: "habit_log";
  habitId: string;
  habitName: string;
  date: string;
  // Units to add on top of what's already logged that day; null means
  // "mark it done" (fill to the target).
  amount: number | null;
};

export type NoteAction = { kind: "note"; title: string; content: string };

export type JournalAction = { kind: "journal"; date: string; content: string };

export type QuickAction =
  | EventAction
  | TaskAction
  | TodoAction
  | TodoCompleteAction
  | HabitCreateAction
  | HabitLogAction
  | NoteAction
  | JournalAction;

// What the interpreters know about the user beyond the text itself.
export type QuickAddContext = {
  today: string; // local YYYY-MM-DD
  nowMinutes: number; // local minutes since midnight
  timeZone: string;
  habits: { id: string; name: string; emoji: string; target: number; unit: string | null }[];
  openTodos: { id: string; title: string }[];
  categories: string[];
};

export type UndoSpec =
  | { type: "delete"; model: "scheduleItem" | "todo" | "habit" | "notebookEntry"; id: string }
  | { type: "uncompleteTodo"; id: string }
  | { type: "habitCount"; habitId: string; date: string; count: number }
  | { type: "journalRestore"; id: string; content: string; contentFormat: string; richContent: unknown };

export type QuickAddResult = {
  ok: boolean;
  kind: QuickAction["kind"];
  icon: string;
  title: string;
  detail: string;
  href: string | null;
  undo: UndoSpec | null;
  error?: string;
};
