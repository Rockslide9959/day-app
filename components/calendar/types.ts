export type CalendarEvent = {
  // The real ScheduleItem id — always use this for API calls.
  id: string;
  // Unique per occurrence (for recurring events, "${id}::${date}") — use
  // for React keys.
  occurrenceId: string;
  occurrenceDate: string;
  isRecurringInstance: boolean;
  // "event" | "task" — a task's `date`/`startTime` represent its due
  // date/time rather than a start of a range (see prisma/schema.prisma).
  itemType: string;
  title: string;
  notes: string | null;
  date: string;
  startTime: string;
  endTime: string;
  endDate: string | null;
  allDay: boolean;
  location: string | null;
  category: string | null;
  priority: string;
  reminderMinutesBefore: number | null;
  recurrence: string;
  recurrenceDays: string | null;
  recurrenceEndDate: string | null;
  completed: boolean;
  completedAt: string | null;
  subject: string | null;
  estimatedHours: number | null;
};

export type ViewMode = "month" | "week" | "day";
