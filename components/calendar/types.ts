export type CalendarEvent = {
  // The real ScheduleItem id — always use this for API calls.
  id: string;
  // Unique per occurrence (for recurring events, "${id}::${date}") — use
  // for React keys.
  occurrenceId: string;
  occurrenceDate: string;
  isRecurringInstance: boolean;
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
  subject: string | null;
  estimatedHours: number | null;
};

export type ViewMode = "month" | "week" | "day";
