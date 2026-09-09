"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  diffDays,
  formatDurationMinutes,
  formatTime12h,
  timeToMinutes,
} from "@/lib/dates";
import { useTodayStr } from "@/lib/useTodayStr";
import {
  busyDayStats,
  dailySummary,
  nowNextEvent,
  overdueTasks,
  tasksDueToday,
  upcomingEvents,
  upcomingTasks,
} from "@/lib/calendar/dashboard";
import { deadlineInfo, countdownLabel, urgencyTier, UrgencyTier } from "@/lib/calendar/deadlines";
import { isDeadlineCategory } from "@/lib/calendar/categories";
import { isScheduleItemVisible } from "@/lib/calendar/visibility";
import { CalendarEvent } from "@/components/calendar/types";
import { NotebookEntryFull } from "@/components/notebook/types";
import { buildContentPreview } from "@/lib/notebookFormat";
import LoadingSpinner from "@/components/LoadingSpinner";

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string;
  recurrence: string;
};
type Todo = { id: string; title: string; completed: boolean };
type Routine = { id: string; name: string; icon: string; steps: { id: string }[] };

const UPCOMING_WINDOW_DAYS = 14;

// Proximity color scale shared by the "Upcoming" pills and the "Tasks due"
// accent bar — overdue/today reads as urgent (red) fading down to neutral
// the further out a date sits.
const URGENCY_PILL_CLASSES: Record<UrgencyTier, string> = {
  overdue: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight",
  today: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight",
  tomorrow: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 crimson:bg-orange-950/50 crimson:text-orange-300",
  soon: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300 crimson:bg-yellow-950/50 crimson:text-yellow-300",
  week: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300 crimson:bg-green-950/50 crimson:text-green-300",
  later: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 crimson:bg-crimson-raised crimson:text-crimson-text-secondary",
};

const URGENCY_BAR_CLASSES: Record<UrgencyTier, string> = {
  overdue: "before:bg-red-500 crimson:before:bg-crimson-accent",
  today: "before:bg-red-500 crimson:before:bg-crimson-accent",
  tomorrow: "before:bg-orange-500 crimson:before:bg-orange-500",
  soon: "before:bg-yellow-500 crimson:before:bg-yellow-500",
  week: "before:bg-green-500 crimson:before:bg-green-500",
  later: "before:bg-zinc-300 dark:before:bg-zinc-600 crimson:before:bg-crimson-border",
};

export default function TodayPage() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineDone, setRoutineDone] = useState<Record<string, number>>({});
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const [journalEntry, setJournalEntry] = useState<NotebookEntryFull | null | undefined>(undefined);
  const [creatingJournal, setCreatingJournal] = useState(false);
  const [todoReminderEnabled, setTodoReminderEnabled] = useState(false);
  const [todoReminderTime, setTodoReminderTime] = useState("20:00");
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const today = useTodayStr();

  const load = useCallback(async () => {
    try {
      // One aggregate call (see lib/dashboard.ts) in place of the old
      // per-section fan-out — the server gathers reminders, schedule,
      // to-dos, routines + their progress, settings and today's journal
      // in a single round trip. It looks ~60 days back on the schedule so
      // incomplete overdue tasks still surface here, not just today-forward.
      const res = await fetch(`/api/dashboard?date=${today}`);
      if (!res.ok) return;
      const data = await res.json();
      setReminders(data.reminders);
      setEvents(data.events);
      setTodos(data.todos);
      setRoutines(data.routines);
      setRoutineDone(data.routineDone ?? {});
      if (data.me?.todoReminderEnabled !== undefined) setTodoReminderEnabled(data.me.todoReminderEnabled);
      if (data.me?.todoReminderTime) setTodoReminderTime(data.me.todoReminderTime);
      setJournalEntry(data.journal ?? null);
    } catch {
      // Leave whatever loaded successfully in place; sections below all
      // handle empty data gracefully rather than hanging on "Loading…".
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function toggleTodo(todo: Todo) {
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, completed: !t.completed } : t))
    );
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    });
  }

  async function toggleTask(task: CalendarEvent) {
    const body = task.isRecurringInstance
      ? { toggleCompletedDate: task.occurrenceDate }
      : { completed: !task.completed };
    const res = await fetch(`/api/schedule/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    await load();
  }

  async function quickStartTodoTimer(todo: Todo) {
    await fetch("/api/timers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: todo.title, mode: "stopwatch", linkedType: "todo", linkedId: todo.id }),
    });
  }

  async function writeAboutToday() {
    if (journalEntry) {
      router.push(`/notebook/${journalEntry.id}`);
      return;
    }
    setCreatingJournal(true);
    try {
      const res = await fetch("/api/notebook/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      if (!res.ok) throw new Error("Request failed");
      const entry = await res.json();
      router.push(`/notebook/${entry.id}`);
    } catch {
      setCreatingJournal(false);
    }
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTodo.trim()) return;
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTodo.trim(), date: today }),
    });
    const todo = await res.json();
    setTodos((prev) => [...prev, todo]);
    setNewTodo("");
  }

  const now = new Date();
  const overdue = reminders.filter((r) => new Date(r.dueAt) <= now);
  const openTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);
  // In-app counterpart to the push notification lib/todoReminderCron.ts
  // sends at the same configured time — this just re-checks it live against
  // the device's own clock, so it also lights up on a page visit even if
  // the push never arrived (notifications off, or the app wasn't installed).
  const todoReminderDue =
    todoReminderEnabled && openTodos.length > 0 && nowMinutes >= timeToMinutes(todoReminderTime);
  const pendingRoutines = routines.filter(
    (r) => r.steps.length > 0 && (routineDone[r.id] || 0) < r.steps.length
  );

  const todayEvents = events
    .filter((e) => e.date === today && e.itemType !== "task")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const { current, next, minutesUntilNext } = nowNextEvent(todayEvents, nowMinutes);
  const dayStats = busyDayStats(todayEvents);
  const summary = dailySummary(todayEvents);
  const upcoming = upcomingEvents(events, today, UPCOMING_WINDOW_DAYS);

  // Tasks due — kept separate from the events-only calcs above (tasks are
  // deadlines, never booked time) and from the lightweight Todo section.
  const tasksToday = tasksDueToday(events, today).filter((t) => isScheduleItemVisible(t));
  const overdueTaskItems = overdueTasks(events, today);
  const upcomingTaskItems = upcomingTasks(events, today, UPCOMING_WINDOW_DAYS);

  if (loading) {
    return <LoadingSpinner className="min-h-[70vh]" />;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Today</h1>
      <p className="mb-6 text-sm text-zinc-500 crimson:text-crimson-text-secondary">
        {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>

      {overdue.length > 0 && (
        <Section title="Due now">
          <ul className="space-y-2">
            {overdue.map((r) => (
              <li key={r.id}>
                <Link
                  href="/reminders"
                  className="block rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight"
                >
                  <span className="font-medium">{r.title}</span>
                  {r.notes && <p className="mt-0.5 text-red-700 dark:text-red-300 crimson:text-crimson-highlight">{r.notes}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {todoReminderDue && (
        <Section title="">
          <Link
            href="/todos"
            className="block rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight"
          >
            <span className="font-medium">Wrap up your day</span> — you still have {openTodos.length} to-do
            {openTodos.length === 1 ? "" : "s"} left today.
          </Link>
        </Section>
      )}

      {next && (
        <Section title="Next">
          <Link
            href="/calendar"
            className="block rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface"
          >
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{next.title}</p>
            <p className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
              {formatTime12h(next.startTime)} · Starts in {formatDurationMinutes(minutesUntilNext ?? 0)}
            </p>
          </Link>
        </Section>
      )}

      {current.length > 0 && (
        <Section title="Happening now">
          <ul className="space-y-2">
            {current.map((e) => (
              <li key={e.occurrenceId}>
                <Link
                  href="/calendar"
                  className="block rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30 crimson:bg-emerald-950/30"
                >
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200 crimson:text-emerald-200">{e.title}</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 crimson:text-emerald-400">
                    Until {formatTime12h(e.endTime)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {dayStats.isBusy && (
        <Section title="">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 crimson:bg-amber-950/40 crimson:text-amber-300">
            <span className="font-medium">Busy day</span> — {dayStats.eventCount} events scheduled
            {dayStats.scheduledMinutes > 0 && `, ${Math.round(dayStats.scheduledMinutes / 60)}h+ booked`}
          </div>
        </Section>
      )}

      {(overdueTaskItems.length > 0 || tasksToday.length > 0 || upcomingTaskItems.length > 0) && (
        <Section title="Tasks due" href="/calendar">
          <ul className="space-y-2">
            {overdueTaskItems.map((t) => (
              <TaskRow key={t.occurrenceId} task={t} today={today} onToggle={toggleTask} />
            ))}
            {tasksToday.map((t) => (
              <TaskRow key={t.occurrenceId} task={t} today={today} onToggle={toggleTask} />
            ))}
            {upcomingTaskItems.map((t) => (
              <TaskRow key={t.occurrenceId} task={t} today={today} onToggle={toggleTask} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Schedule" href="/calendar">
        {todayEvents.length === 0 ? (
          <EmptyRow text="Nothing scheduled today" />
        ) : (
          <ul className="space-y-2">
            {todayEvents.map((s) => (
              <li key={s.occurrenceId}>
                <Link
                  href="/calendar"
                  className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface"
                >
                  <span className="w-20 shrink-0 text-xs font-medium text-zinc-500 crimson:text-crimson-text-secondary">
                    {s.allDay ? "All day" : `${formatTime12h(s.startTime)}`}
                  </span>
                  <span className={`text-sm ${s.completed ? "text-zinc-400 line-through crimson:text-crimson-text-muted" : "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"}`}>
                    {s.title}
                  </span>
                  {(s.priority === "high" || s.priority === "urgent") && (
                    <span className="ml-auto text-xs">{s.priority === "urgent" ? "🔴" : "🟠"}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {summary.eventCount > 0 && (
        <Section title="">
          <div className="rounded-xl bg-zinc-100 px-4 py-3 text-xs text-zinc-500 dark:bg-zinc-800/60 crimson:bg-crimson-raised/60 crimson:text-crimson-text-secondary">
            {summary.eventCount} event{summary.eventCount === 1 ? "" : "s"} · Scheduled time:{" "}
            {Math.round((summary.scheduledMinutes / 60) * 10) / 10}h
            {summary.highPriorityCount > 0 && ` · ${summary.highPriorityCount} high-priority`}
          </div>
        </Section>
      )}

      <Section title="Upcoming" href="/calendar">
        {upcoming.length === 0 ? (
          <EmptyRow text="Nothing notable coming up in the next two weeks" />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((e) => {
              const deadline = isDeadlineCategory(e.category) ? deadlineInfo(e.date, today) : null;
              const tier = urgencyTier(diffDays(today, e.date));
              return (
                <li key={e.occurrenceId}>
                  <Link
                    href="/calendar"
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface"
                  >
                    <div>
                      <p className="text-sm text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{e.title}</p>
                      <p className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                        {e.date === today ? "Today" : e.date} {!e.allDay && `· ${formatTime12h(e.startTime)}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${URGENCY_PILL_CLASSES[tier]}`}
                    >
                      {deadline ? deadline.label : countdownLabel(e.date, today)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="To-Do">
        <form onSubmit={addTodo} className="mb-3 flex gap-2">
          <input
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Add something to do today…"
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 crimson:border-crimson-border crimson:bg-crimson-surface crimson:focus:border-crimson-accent"
          />
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
          >
            Add
          </button>
        </form>
        {openTodos.length === 0 && completedTodos.length === 0 ? (
          <EmptyRow text="No to-dos yet today" />
        ) : (
          <ul className="space-y-2">
            {[...openTodos, ...completedTodos].map((t) => (
              <li
                key={t.id}
                className="relative flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface crimson:before:absolute crimson:before:inset-y-2 crimson:before:left-0 crimson:before:w-1 crimson:before:rounded-full crimson:before:bg-crimson-accent"
              >
                <span
                  onClick={() => toggleTodo(t)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    t.completed
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 crimson:border-crimson-accent crimson:bg-crimson-accent crimson:text-crimson-text"
                      : "border-zinc-300 dark:border-zinc-600 crimson:border-crimson-border"
                  }`}
                >
                  {t.completed && "✓"}
                </span>
                <span
                  onClick={() => toggleTodo(t)}
                  className={`flex-1 text-sm ${
                    t.completed
                      ? "text-zinc-400 line-through crimson:text-crimson-text-muted"
                      : "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
                  }`}
                >
                  {t.title}
                </span>
                {!t.completed && (
                  <button
                    onClick={() => quickStartTodoTimer(t)}
                    title="Start a stopwatch for this to-do"
                    className="shrink-0 text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-300 crimson:text-crimson-text-secondary crimson:hover:text-crimson-text"
                  >
                    ⏱
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {journalEntry !== undefined && (
        <Section title="Journal" href="/notebook">
          {journalEntry ? (
            <button
              onClick={writeAboutToday}
              className="w-full rounded-xl bg-white px-4 py-3 text-left shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface"
            >
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{journalEntry.title}</p>
              {journalEntry.content && (
                <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                  {buildContentPreview(journalEntry.content, 160)}
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-400 crimson:text-crimson-text-muted">
                Last edited {new Date(journalEntry.updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
              <span className="mt-2 inline-block text-xs font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
                Continue writing →
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-5 text-center dark:border-zinc-800 crimson:border-crimson-border">
              <p className="mb-3 text-sm text-zinc-400 crimson:text-crimson-text-muted">You haven&apos;t written anything today.</p>
              <button
                onClick={writeAboutToday}
                disabled={creatingJournal}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
              >
                {creatingJournal ? "Opening…" : "Write about today"}
              </button>
            </div>
          )}
        </Section>
      )}

      <Section title="Routines" href="/routines">
        {pendingRoutines.length === 0 ? (
          <EmptyRow text="All routines done, or none set up yet" />
        ) : (
          <ul className="space-y-2">
            {pendingRoutines.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/routines/${r.id}`}
                  className="relative flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface crimson:before:absolute crimson:before:inset-y-2 crimson:before:left-0 crimson:before:w-1 crimson:before:rounded-full crimson:before:bg-crimson-accent"
                >
                  <span className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
                    <span>{r.icon}</span>
                    {r.name}
                  </span>
                  <span className="text-xs text-zinc-400 crimson:text-crimson-text-muted">
                    {routineDone[r.id] || 0}/{r.steps.length}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {title && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 crimson:text-crimson-text-secondary">
            {title}
          </h2>
          {href && (
            <Link href={href} className="text-xs text-zinc-400 hover:text-zinc-600 crimson:text-crimson-text-muted crimson:hover:text-crimson-text-secondary">
              View all
            </Link>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-5 text-center text-sm text-zinc-400 dark:border-zinc-800 crimson:border-crimson-border crimson:text-crimson-text-muted">
      {text}
    </div>
  );
}

function TaskRow({
  task,
  today,
  onToggle,
}: {
  task: CalendarEvent;
  today: string;
  onToggle: (task: CalendarEvent) => void;
}) {
  const info = deadlineInfo(task.date, today);
  const overdue = info.urgency === "overdue";
  const tier = urgencyTier(info.daysUntil);
  const dueLabel =
    task.date === today && !task.allDay
      ? `Due ${formatTime12h(task.startTime)}`
      : task.allDay
        ? info.label
        : `${info.label} · ${formatTime12h(task.startTime)}`;

  return (
    <li
      className={`relative flex items-center gap-3 rounded-xl px-4 py-3 shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full ${URGENCY_BAR_CLASSES[tier]} ${
        overdue ? "bg-red-50 dark:bg-red-950/30 crimson:bg-crimson-accent/15" : "bg-white dark:bg-zinc-900 crimson:bg-crimson-surface"
      }`}
    >
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        aria-label={task.completed ? `Reopen task: ${task.title}` : `Mark task complete: ${task.title}`}
        className="h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600 crimson:border-crimson-border"
      />
      <Link href="/calendar" className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${
            task.completed
              ? "text-zinc-400 line-through crimson:text-crimson-text-muted"
              : overdue
                ? "font-medium text-red-900 dark:text-red-200 crimson:text-crimson-highlight"
                : "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
          }`}
        >
          {task.title}
        </span>
        <span className={`block text-xs ${overdue ? "text-red-600 dark:text-red-400 crimson:text-crimson-highlight" : "text-zinc-500 crimson:text-crimson-text-secondary"}`}>
          {dueLabel}
        </span>
      </Link>
    </li>
  );
}
