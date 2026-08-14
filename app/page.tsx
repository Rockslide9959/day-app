"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { addDaysToDateStr, formatDateLabel, formatDurationMinutes, formatTime12h, todayStr } from "@/lib/dates";
import {
  busyDayStats,
  dailySummary,
  nowNextEvent,
  overdueTasks,
  tasksDueToday,
  upcomingEvents,
  upcomingTasks,
} from "@/lib/calendar/dashboard";
import { deadlineInfo, countdownLabel } from "@/lib/calendar/deadlines";
import { isDeadlineCategory } from "@/lib/calendar/categories";
import { isScheduleItemVisible } from "@/lib/calendar/visibility";
import { CalendarEvent } from "@/components/calendar/types";
import { Timer } from "@/components/timers/types";
import TimerCard from "@/components/timers/TimerCard";

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
const OVERDUE_LOOKBACK_DAYS = 60;

export default function TodayPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineDone, setRoutineDone] = useState<Record<string, number>>({});
  const [timers, setTimers] = useState<Timer[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const today = todayStr();

  const load = useCallback(async () => {
    try {
      const [remindersRes, eventsRes, todosRes, routinesRes, timersRes] = await Promise.all([
        fetch("/api/reminders").then((r) => r.json()),
        // Looks back OVERDUE_LOOKBACK_DAYS so incomplete overdue tasks from
        // before today still surface here, not just today-forward.
        fetch(
          `/api/schedule?from=${addDaysToDateStr(today, -OVERDUE_LOOKBACK_DAYS)}&to=${addDaysToDateStr(today, UPCOMING_WINDOW_DAYS)}`
        ).then((r) => r.json()),
        fetch(`/api/todos?date=${today}`).then((r) => r.json()),
        fetch("/api/routines").then((r) => r.json()),
        fetch("/api/timers").then((r) => r.json()),
      ]);
      setReminders(remindersRes);
      setEvents(eventsRes);
      setTodos(todosRes);
      setRoutines(routinesRes);
      setTimers(timersRes);

      const doneEntries = await Promise.all(
        routinesRes.map(async (r: Routine) => {
          const res = await fetch(`/api/routines/${r.id}/run?date=${today}`).then((r) => r.json());
          return [r.id, res.completedStepIds.length] as const;
        })
      );
      setRoutineDone(Object.fromEntries(doneEntries));
    } catch {
      // Leave whatever loaded successfully in place; sections below all
      // handle empty data gracefully rather than hanging on "Loading…".
    }
    setLoading(false);
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

  function upsertTimer(timer: Timer) {
    setTimers((prev) => {
      const exists = prev.some((t) => t.id === timer.id);
      return exists ? prev.map((t) => (t.id === timer.id ? timer : t)) : [timer, ...prev];
    });
  }

  function removeTimer(id: string) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }

  async function quickStartTodoTimer(todo: Todo) {
    const res = await fetch("/api/timers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: todo.title, mode: "stopwatch", linkedType: "todo", linkedId: todo.id }),
    });
    if (res.ok) upsertTimer(await res.json());
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
  const activeTimers = timers.filter((t) => t.status !== "completed");

  // Tasks due — kept separate from the events-only calcs above (tasks are
  // deadlines, never booked time) and from the lightweight Todo section.
  const tasksToday = tasksDueToday(events, today).filter((t) => isScheduleItemVisible(t));
  const overdueTaskItems = overdueTasks(events, today);
  const upcomingTaskItems = upcomingTasks(events, today, UPCOMING_WINDOW_DAYS);

  if (loading) {
    return <div className="p-6 text-zinc-400">Loading…</div>;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Today</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>

      {overdue.length > 0 && (
        <Section title="Due now">
          <ul className="space-y-2">
            {overdue.map((r) => (
              <li
                key={r.id}
                className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                <span className="font-medium">{r.title}</span>
                {r.notes && <p className="mt-0.5 text-red-700 dark:text-red-300">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {next && (
        <Section title="Next">
          <div className="rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{next.title}</p>
            <p className="text-xs text-zinc-500">
              {formatTime12h(next.startTime)} · Starts in {formatDurationMinutes(minutesUntilNext ?? 0)}
            </p>
          </div>
        </Section>
      )}

      {current.length > 0 && (
        <Section title="Happening now">
          <ul className="space-y-2">
            {current.map((e) => (
              <li key={e.occurrenceId} className="rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">{e.title}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Until {formatTime12h(e.endTime)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {dayStats.isBusy && (
        <Section title="">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="font-medium">Busy day</span> — {dayStats.eventCount} events scheduled
            {dayStats.scheduledMinutes > 0 && `, ${Math.round(dayStats.scheduledMinutes / 60)}h+ booked`}
          </div>
        </Section>
      )}

      {(overdueTaskItems.length > 0 || tasksToday.length > 0 || upcomingTaskItems.length > 0) && (
        <Section title="Tasks due" href="/calendar">
          <ul className="space-y-2">
            {overdueTaskItems.map((t) => (
              <TaskRow key={t.occurrenceId} task={t} today={today} overdue onToggle={toggleTask} />
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
              <li
                key={s.occurrenceId}
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
              >
                <span className="w-20 shrink-0 text-xs font-medium text-zinc-500">
                  {s.allDay ? "All day" : `${formatTime12h(s.startTime)}`}
                </span>
                <span className={`text-sm ${s.completed ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"}`}>
                  {s.title}
                </span>
                {(s.priority === "high" || s.priority === "urgent") && (
                  <span className="ml-auto text-xs">{s.priority === "urgent" ? "🔴" : "🟠"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {summary.eventCount > 0 && (
        <Section title="">
          <div className="rounded-xl bg-zinc-100 px-4 py-3 text-xs text-zinc-500 dark:bg-zinc-800/60">
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
              return (
                <li
                  key={e.occurrenceId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
                >
                  <div>
                    <p className="text-sm text-zinc-900 dark:text-zinc-50">{e.title}</p>
                    <p className="text-xs text-zinc-500">
                      {e.date === today ? "Today" : e.date} {!e.allDay && `· ${formatTime12h(e.startTime)}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                      deadline?.urgency === "overdue"
                        ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                        : deadline?.urgency === "soon" || deadline?.urgency === "today"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                    }`}
                  >
                    {deadline ? deadline.label : countdownLabel(e.date, today)}
                  </span>
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
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
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
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
              >
                <span
                  onClick={() => toggleTodo(t)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    t.completed
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {t.completed && "✓"}
                </span>
                <span
                  onClick={() => toggleTodo(t)}
                  className={`flex-1 text-sm ${
                    t.completed
                      ? "text-zinc-400 line-through"
                      : "text-zinc-900 dark:text-zinc-50"
                  }`}
                >
                  {t.title}
                </span>
                {!t.completed && (
                  <button
                    onClick={() => quickStartTodoTimer(t)}
                    title="Start a stopwatch for this to-do"
                    className="shrink-0 text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    ⏱
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Routines" href="/routines">
        {pendingRoutines.length === 0 ? (
          <EmptyRow text="All routines done, or none set up yet" />
        ) : (
          <ul className="space-y-2">
            {pendingRoutines.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/routines/${r.id}`}
                  className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
                >
                  <span className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
                    <span>{r.icon}</span>
                    {r.name}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {routineDone[r.id] || 0}/{r.steps.length}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Timers" href="/timers">
        {activeTimers.length === 0 ? (
          <EmptyRow text="No timers running" />
        ) : (
          <ul className="space-y-2">
            {activeTimers.slice(0, 3).map((t) => (
              <li key={t.id}>
                <TimerCard timer={t} onUpdated={upsertTimer} onDeleted={removeTimer} />
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {title}
          </h2>
          {href && (
            <Link href={href} className="text-xs text-zinc-400 hover:text-zinc-600">
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
    <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-5 text-center text-sm text-zinc-400 dark:border-zinc-800">
      {text}
    </div>
  );
}

function TaskRow({
  task,
  today,
  overdue = false,
  onToggle,
}: {
  task: CalendarEvent;
  today: string;
  overdue?: boolean;
  onToggle: (task: CalendarEvent) => void;
}) {
  const dueLabel =
    task.date === today
      ? task.allDay
        ? "Due today"
        : `Due ${formatTime12h(task.startTime)}`
      : task.allDay
        ? `Due ${formatDateLabel(task.date)}`
        : `Due ${formatDateLabel(task.date)} · ${formatTime12h(task.startTime)}`;

  return (
    <li
      className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-sm ${
        overdue ? "bg-red-50 dark:bg-red-950/30" : "bg-white dark:bg-zinc-900"
      }`}
    >
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        aria-label={task.completed ? `Reopen task: ${task.title}` : `Mark task complete: ${task.title}`}
        className="h-4 w-4 shrink-0 rounded border-zinc-300"
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${
            task.completed
              ? "text-zinc-400 line-through"
              : overdue
                ? "font-medium text-red-900 dark:text-red-200"
                : "text-zinc-900 dark:text-zinc-50"
          }`}
        >
          {task.title}
        </span>
        <span className={`block text-xs ${overdue ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
          {overdue ? "Overdue · " : ""}
          {dueLabel}
        </span>
      </span>
    </li>
  );
}
