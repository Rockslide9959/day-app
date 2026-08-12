"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { todayStr } from "@/lib/dates";

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string;
  recurrence: string;
};
type ScheduleItem = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
};
type Todo = { id: string; title: string; completed: boolean };
type Routine = { id: string; name: string; icon: string; steps: { id: string }[] };

export default function TodayPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineDone, setRoutineDone] = useState<Record<string, number>>({});
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const today = todayStr();

  const load = useCallback(async () => {
    const [remindersRes, scheduleRes, todosRes, routinesRes] = await Promise.all([
      fetch("/api/reminders").then((r) => r.json()),
      fetch(`/api/schedule?date=${today}`).then((r) => r.json()),
      fetch(`/api/todos?date=${today}`).then((r) => r.json()),
      fetch("/api/routines").then((r) => r.json()),
    ]);
    setReminders(remindersRes);
    setSchedule(scheduleRes);
    setTodos(todosRes);
    setRoutines(routinesRes);

    const doneEntries = await Promise.all(
      routinesRes.map(async (r: Routine) => {
        const res = await fetch(`/api/routines/${r.id}/run?date=${today}`).then((r) =>
          r.json()
        );
        return [r.id, res.completedStepIds.length] as const;
      })
    );
    setRoutineDone(Object.fromEntries(doneEntries));
    setLoading(false);
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (loading) {
    return <div className="p-6 text-zinc-400">Loading…</div>;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Today
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        {new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
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

      <Section title="Schedule" href="/schedule">
        {schedule.length === 0 ? (
          <EmptyRow text="Nothing scheduled today" />
        ) : (
          <ul className="space-y-2">
            {schedule.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
              >
                <span className="w-20 shrink-0 text-xs font-medium text-zinc-500">
                  {s.startTime}–{s.endTime}
                </span>
                <span className="text-sm text-zinc-900 dark:text-zinc-50">{s.title}</span>
              </li>
            ))}
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
                onClick={() => toggleTodo(t)}
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    t.completed
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {t.completed && "✓"}
                </span>
                <span
                  className={`text-sm ${
                    t.completed
                      ? "text-zinc-400 line-through"
                      : "text-zinc-900 dark:text-zinc-50"
                  }`}
                >
                  {t.title}
                </span>
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
