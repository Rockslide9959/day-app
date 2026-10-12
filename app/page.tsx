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
import { categoryColor, isDeadlineCategory } from "@/lib/calendar/categories";
import { isScheduleItemVisible } from "@/lib/calendar/visibility";
import { CalendarEvent } from "@/components/calendar/types";
import { NotebookEntryFull } from "@/components/notebook/types";
import { buildContentPreview } from "@/lib/notebookFormat";
import { HabitWithLogs, isDueOn, nextTapCount, summarizeHabit } from "@/lib/habits";
import HabitRing from "@/components/habits/HabitRing";
import FlameBadge from "@/components/habits/FlameBadge";
import CelebrationToast from "@/components/habits/CelebrationToast";
import { useHabitLogger } from "@/components/habits/useHabitLogger";
import LoadingSpinner from "@/components/LoadingSpinner";

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string;
  recurrence: string;
};
type Todo = { id: string; title: string; completed: boolean; rolledOver: boolean };

const UPCOMING_WINDOW_DAYS = 14;

// Shared card surface for every section on the page.
const CARD =
  "rounded-3xl bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border";

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

function greetingFor(minutes: number): string {
  const h = Math.floor(minutes / 60);
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [habits, setHabits] = useState<HabitWithLogs[]>([]);
  const [username, setUsername] = useState("");
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
  const { setCount, celebration, dismissCelebration } = useHabitLogger(habits, setHabits, today);

  const load = useCallback(async () => {
    try {
      // One aggregate call (see lib/dashboard.ts) in place of a per-section
      // fan-out — the server gathers reminders, schedule, to-dos, habits,
      // settings and today's journal in a single round trip. It looks ~60
      // days back on the schedule so incomplete overdue tasks still surface
      // here, not just today-forward.
      const res = await fetch(`/api/dashboard?date=${today}`);
      if (!res.ok) return;
      const data = await res.json();
      setReminders(data.reminders);
      setEvents(data.events);
      setTodos(data.todos);
      setHabits(data.habits ?? []);
      if (data.me?.username) setUsername(data.me.username);
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

  const habitsDue = habits.filter((h) => isDueOn(h.days, today));
  const habitsDone = habitsDue.filter((h) => (h.logs[today] ?? 0) >= h.target).length;
  const tasksTodayDone = tasksToday.filter((t) => t.completed).length;

  // One "how's the day going" number across everything checkable today.
  const dayTotal = todos.length + habitsDue.length + tasksToday.length;
  const dayDone = completedTodos.length + habitsDone + tasksTodayDone;

  if (loading) {
    return <LoadingSpinner className="min-h-[70vh]" />;
  }

  const hasAlerts = overdue.length > 0 || todoReminderDue || dayStats.isBusy;

  return (
    <>
      <main className="phase-in mx-auto max-w-2xl px-4 pt-8">
        <header className="mb-5 pr-24">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 crimson:text-crimson-accent">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
            {greetingFor(nowMinutes)}
            {username && <span className="text-zinc-400 crimson:text-crimson-text-muted">, {username}</span>}
          </h1>
        </header>

        <DayHero
          done={dayDone}
          total={dayTotal}
          todos={{ done: completedTodos.length, total: todos.length }}
          habits={{ done: habitsDone, total: habitsDue.length }}
          eventCount={summary.eventCount}
          scheduledHours={Math.round((summary.scheduledMinutes / 60) * 10) / 10}
          current={current[0]}
          next={next}
          minutesUntilNext={minutesUntilNext}
        />

        {hasAlerts && (
          <div className="mb-6 space-y-2">
            {overdue.map((r) => (
              <Alert key={r.id} href="/reminders" icon="🔔" tone="red" title={r.title} detail={r.notes ?? "Reminder due"} />
            ))}
            {todoReminderDue && (
              <Alert
                href="/todos"
                icon="🌙"
                tone="red"
                title="Wrap up your day"
                detail={`${openTodos.length} to-do${openTodos.length === 1 ? "" : "s"} still open`}
              />
            )}
            {dayStats.isBusy && (
              <Alert
                icon="⚡"
                tone="amber"
                title="Busy day"
                detail={`${dayStats.eventCount} events${dayStats.scheduledMinutes > 0 ? ` · ${Math.round(dayStats.scheduledMinutes / 60)}h+ booked` : ""}`}
              />
            )}
          </div>
        )}

        <Section title="Habits" href="/habits" badge={habitsDue.length ? `${habitsDone}/${habitsDue.length}` : undefined}>
          {habits.length === 0 ? (
            <Link
              href="/habits"
              className={`${CARD} flex items-center gap-4 px-5 py-4 transition active:scale-[0.99]`}
            >
              <span className="flex -space-x-2 text-2xl">
                <span>💧</span>
                <span>📚</span>
                <span>🏃</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Start building habits</span>
                <span className="block text-xs text-zinc-500 crimson:text-crimson-text-secondary">Streaks, counters and a heatmap of your progress</span>
              </span>
              <span className="text-zinc-300 crimson:text-crimson-text-muted">→</span>
            </Link>
          ) : (
            <div className={`${CARD} -mx-1 overflow-x-auto px-4 pb-3 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
              <div className="flex gap-4">
                {[...habitsDue, ...habits.filter((h) => !isDueOn(h.days, today))].map((h) => {
                  const s = summarizeHabit(h, today);
                  return (
                    <div key={h.id} className={`flex w-16 shrink-0 flex-col items-center ${s.dueToday ? "" : "opacity-50"}`}>
                      <HabitRing
                        emoji={h.emoji}
                        color={h.color}
                        count={s.todayCount}
                        target={h.target}
                        size={56}
                        label={`${h.name}: ${s.todayCount} of ${h.target}. Tap to log, hold to undo.`}
                        onTap={() => setCount(h, today, nextTapCount(h, s.todayCount))}
                        onLongPress={() => setCount(h, today, Math.max(0, s.todayCount - 1))}
                      />
                      <span className="mt-2 w-full truncate text-center text-[11px] font-medium text-zinc-600 dark:text-zinc-300 crimson:text-crimson-text-secondary">
                        {h.name}
                      </span>
                      <FlameBadge streak={s.currentStreak} className="text-[10px]" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

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

        <Section title="Schedule" href="/calendar" badge={todayEvents.length ? String(todayEvents.length) : undefined}>
          {todayEvents.length === 0 ? (
            <EmptyRow text="Nothing scheduled today — the day is yours" />
          ) : (
            <Timeline events={todayEvents} nowMinutes={nowMinutes} />
          )}
        </Section>

        <Section title="To-Do" href="/todos" badge={todos.length ? `${completedTodos.length}/${todos.length}` : undefined}>
          <div className={`${CARD} overflow-hidden`}>
            <form onSubmit={addTodo} className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800 crimson:border-crimson-border">
              <span className="text-lg text-zinc-300 crimson:text-crimson-text-muted">＋</span>
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Add something to do today…"
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-zinc-400 crimson:placeholder:text-crimson-text-muted"
              />
              {newTodo.trim() && (
                <button
                  type="submit"
                  className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
                >
                  Add
                </button>
              )}
            </form>
            {todos.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-zinc-400 crimson:text-crimson-text-muted">No to-dos yet today</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 crimson:divide-crimson-border">
                {[...openTodos, ...completedTodos].map((t) => (
                  <li
                    key={t.id}
                    className={`relative flex items-center gap-3 px-4 py-3 ${
                      t.rolledOver && !t.completed
                        ? "bg-amber-50/70 dark:bg-amber-950/30 crimson:bg-amber-950/20"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTodo(t)}
                      aria-label={t.completed ? `Reopen ${t.title}` : `Complete ${t.title}`}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition active:scale-90 ${
                        t.completed
                          ? "border-emerald-500 bg-emerald-500 text-white crimson:border-crimson-accent crimson:bg-crimson-accent"
                          : t.rolledOver
                            ? "border-amber-400 crimson:border-amber-500"
                            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-600 crimson:border-crimson-border"
                      }`}
                    >
                      {t.completed && "✓"}
                    </button>
                    <span
                      onClick={() => toggleTodo(t)}
                      className={`flex-1 cursor-pointer text-sm transition ${
                        t.completed
                          ? "text-zinc-400 line-through crimson:text-crimson-text-muted"
                          : t.rolledOver
                            ? "text-amber-800 dark:text-amber-300 crimson:text-crimson-text"
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
          </div>
        </Section>

        <Section title="Upcoming" href="/calendar">
          {upcoming.length === 0 ? (
            <EmptyRow text="Nothing notable coming up in the next two weeks" />
          ) : (
            <ul className={`${CARD} divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800 crimson:divide-crimson-border`}>
              {upcoming.map((e) => {
                const deadline = isDeadlineCategory(e.category) ? deadlineInfo(e.date, today) : null;
                const tier = urgencyTier(diffDays(today, e.date));
                const [, m, d] = e.date.split("-").map(Number);
                const month = new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
                return (
                  <li key={e.occurrenceId}>
                    <Link href="/calendar" className="flex items-center gap-3 px-4 py-3">
                      <span className="flex w-10 shrink-0 flex-col items-center rounded-xl bg-zinc-50 py-1 dark:bg-zinc-800 crimson:bg-crimson-raised">
                        <span className="text-[9px] font-semibold uppercase text-zinc-400 crimson:text-crimson-accent">{month}</span>
                        <span className="text-sm font-bold leading-tight text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{d}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{e.title}</p>
                        <p className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                          {e.allDay ? "All day" : formatTime12h(e.startTime)}
                          {e.category && ` · ${e.category}`}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${URGENCY_PILL_CLASSES[tier]}`}>
                        {deadline ? deadline.label : countdownLabel(e.date, today)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {journalEntry !== undefined && (
          <Section title="Journal" href="/notebook">
            <button
              onClick={writeAboutToday}
              disabled={creatingJournal}
              className="relative w-full overflow-hidden rounded-3xl bg-linear-to-br from-violet-50 via-white to-sky-50 p-5 text-left shadow-sm ring-1 ring-zinc-900/5 transition active:scale-[0.99] disabled:opacity-60 dark:from-violet-950/40 dark:via-zinc-900 dark:to-sky-950/30 dark:ring-white/10 crimson:from-crimson-accent/20 crimson:via-crimson-surface crimson:to-crimson-surface crimson:ring-crimson-border"
            >
              <span aria-hidden="true" className="absolute -right-3 -top-4 text-7xl opacity-10">✍️</span>
              {journalEntry ? (
                <>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{journalEntry.title}</p>
                  {journalEntry.content && (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                      {buildContentPreview(journalEntry.content, 160)}
                    </p>
                  )}
                  <p className="mt-3 text-xs font-semibold text-violet-700 dark:text-violet-300 crimson:text-crimson-highlight">
                    Continue writing → <span className="font-normal text-zinc-400 crimson:text-crimson-text-muted">
                      edited {new Date(journalEntry.updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">How was today?</p>
                  <p className="mt-1 text-xs text-zinc-500 crimson:text-crimson-text-secondary">You haven&apos;t written anything yet.</p>
                  <p className="mt-3 text-xs font-semibold text-violet-700 dark:text-violet-300 crimson:text-crimson-highlight">
                    {creatingJournal ? "Opening…" : "Write about today →"}
                  </p>
                </>
              )}
            </button>
          </Section>
        )}
      </main>
      <CelebrationToast celebration={celebration} onDone={dismissCelebration} />
    </>
  );
}

function DayHero({
  done,
  total,
  todos,
  habits,
  eventCount,
  scheduledHours,
  current,
  next,
  minutesUntilNext,
}: {
  done: number;
  total: number;
  todos: { done: number; total: number };
  habits: { done: number; total: number };
  eventCount: number;
  scheduledHours: number;
  current?: CalendarEvent;
  next: CalendarEvent | null;
  minutesUntilNext: number | null;
}) {
  const ratio = total ? done / total : 0;
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const complete = total > 0 && done === total;

  return (
    <section
      className={`relative mb-6 overflow-hidden rounded-3xl p-5 text-white shadow-lg ${
        complete
          ? "bg-linear-to-br from-emerald-500 via-teal-500 to-sky-600"
          : "bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-700 dark:from-zinc-800 dark:via-zinc-900 dark:to-black dark:ring-1 dark:ring-white/10 crimson:from-crimson-accent crimson:via-[#8f1424] crimson:to-crimson-raised"
      }`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-white/5 blur-2xl" />

      <div className="relative flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="white" strokeOpacity={0.15} strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="white"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - ratio)}
              style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.3, 1.2, 0.5, 1)" }}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums leading-none">{total ? `${Math.round(ratio * 100)}%` : "—"}</span>
            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60">today</span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-snug">
            {complete ? "Everything done. Legend. 🎉" : total === 0 ? "A blank slate." : `${total - done} thing${total - done === 1 ? "" : "s"} left today`}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <HeroStat label="To-dos" value={todos.total ? `${todos.done}/${todos.total}` : "0"} />
            <HeroStat label="Habits" value={habits.total ? `${habits.done}/${habits.total}` : "0"} />
            <HeroStat label="Events" value={String(eventCount)} sub={eventCount ? `${scheduledHours}h` : undefined} />
          </div>
        </div>
      </div>

      {(current || next) && (
        <Link
          href="/calendar"
          className="relative mt-4 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5 backdrop-blur transition hover:bg-white/15"
        >
          {current ? (
            <>
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">Now:</span> {current.title}
              </span>
              <span className="shrink-0 text-xs text-white/70">until {formatTime12h(current.endTime)}</span>
            </>
          ) : (
            next && (
              <>
                <span className="text-sm">⏭</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-semibold">Next:</span> {next.title}
                </span>
                <span className="shrink-0 text-xs text-white/70">
                  {formatTime12h(next.startTime)} · in {formatDurationMinutes(minutesUntilNext ?? 0)}
                </span>
              </>
            )
          )}
        </Link>
      )}
    </section>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-2 py-1.5">
      <p className="text-sm font-bold tabular-nums leading-tight">
        {value}
        {sub && <span className="ml-1 text-[10px] font-medium text-white/60">{sub}</span>}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-white/60">{label}</p>
    </div>
  );
}

function Alert({
  href,
  icon,
  tone,
  title,
  detail,
}: {
  href?: string;
  icon: string;
  tone: "red" | "amber";
  title: string;
  detail: string;
}) {
  const tones = {
    red: "bg-red-50 text-red-900 ring-red-200/60 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/50 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight crimson:ring-crimson-accent/40",
    amber: "bg-amber-50 text-amber-900 ring-amber-200/60 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/50 crimson:bg-amber-950/40 crimson:text-amber-300 crimson:ring-amber-900/50",
  };
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-base dark:bg-black/20">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs opacity-75">{detail}</span>
      </span>
      {href && <span className="opacity-50">→</span>}
    </>
  );
  const className = `flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${tones[tone]}`;
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// Today's events on a vertical line, with a "now" marker slotted in
// between what's finished and what's still to come.
function Timeline({ events, nowMinutes }: { events: CalendarEvent[]; nowMinutes: number }) {
  const nowIndex = events.findIndex((e) => !e.allDay && timeToMinutes(e.startTime) > nowMinutes);
  const markerAt = nowIndex === -1 ? events.length : nowIndex;
  const nowLabel = formatTime12h(
    `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`
  );

  return (
    <div className={`${CARD} px-4 py-3`}>
      <ol className="relative">
        <span aria-hidden="true" className="absolute bottom-3 left-[81px] top-3 w-px bg-zinc-200 dark:bg-zinc-800 crimson:bg-crimson-border" />
        {events.map((e, i) => {
          const start = timeToMinutes(e.startTime);
          const end = timeToMinutes(e.endTime);
          const live = !e.allDay && start <= nowMinutes && nowMinutes < end;
          const past = !e.allDay && end <= nowMinutes;
          const color = categoryColor(e.category);
          return (
            <li key={e.occurrenceId}>
              {i === markerAt && <NowMarker label={nowLabel} />}
              <Link href="/calendar" className={`relative flex items-center gap-3 py-2 ${past ? "opacity-45" : ""}`}>
                <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-zinc-500 crimson:text-crimson-text-secondary">
                  {e.allDay ? "All day" : formatTime12h(e.startTime)}
                </span>
                <span
                  className={`relative z-10 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white dark:ring-zinc-900 crimson:ring-crimson-surface ${live ? "scale-125" : ""}`}
                  style={{ background: color }}
                />
                <span
                  className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${live ? "ring-1" : ""}`}
                  style={{
                    background: `color-mix(in srgb, ${color} ${live ? 16 : 8}%, transparent)`,
                    ...(live ? { ["--tw-ring-color" as string]: color } : {}),
                  }}
                >
                  <span
                    className={`block truncate text-sm font-medium ${
                      e.completed ? "text-zinc-400 line-through crimson:text-crimson-text-muted" : "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
                    }`}
                  >
                    {e.title}
                    {(e.priority === "high" || e.priority === "urgent") && (
                      <span className="ml-1.5 text-xs">{e.priority === "urgent" ? "🔴" : "🟠"}</span>
                    )}
                  </span>
                  {!e.allDay && (
                    <span className="block text-[11px] text-zinc-500 crimson:text-crimson-text-secondary">
                      {live ? `Happening now · until ${formatTime12h(e.endTime)}` : `${formatTime12h(e.startTime)} – ${formatTime12h(e.endTime)}`}
                      {e.location && ` · ${e.location}`}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
        {markerAt === events.length && (
          <li>
            <NowMarker label={nowLabel} />
          </li>
        )}
      </ol>
    </div>
  );
}

function NowMarker({ label }: { label: string }) {
  return (
    <div className="relative flex items-center gap-3 py-1" aria-label={`Now, ${label}`}>
      <span className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wide text-rose-500 crimson:text-crimson-highlight">Now</span>
      <span className="relative z-10 h-2 w-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.2)] crimson:bg-crimson-highlight" />
      <span className="h-px flex-1 bg-rose-500/50 crimson:bg-crimson-highlight/50" />
    </div>
  );
}

function Section({
  title,
  href,
  badge,
  children,
}: {
  title: string;
  href?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
          {title}
          {badge && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 crimson:bg-crimson-raised crimson:text-crimson-text-secondary">
              {badge}
            </span>
          )}
        </h2>
        {href && (
          <Link href={href} className="text-xs font-medium text-zinc-400 hover:text-zinc-600 crimson:text-crimson-text-muted crimson:hover:text-crimson-text-secondary">
            View all →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800 crimson:border-crimson-border crimson:text-crimson-text-muted">
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
      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 shadow-sm ring-1 before:absolute before:inset-y-0 before:left-0 before:w-1 ${URGENCY_BAR_CLASSES[tier]} ${
        overdue
          ? "bg-red-50 ring-red-200/60 dark:bg-red-950/30 dark:ring-red-900/40 crimson:bg-crimson-accent/15 crimson:ring-crimson-accent/40"
          : "bg-white ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border"
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
