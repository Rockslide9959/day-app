"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDateLabel, addDaysToDateStr } from "@/lib/dates";
import { useSyncedDate } from "@/lib/useTodayStr";
import AttachmentList from "@/components/attachments/AttachmentList";
import LoadingSpinner from "@/components/LoadingSpinner";

type Todo = { id: string; title: string; completed: boolean };

export default function TodosPage() {
  const [date, setDate] = useSyncedDate();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/todos?date=${date}`).then((r) => r.json());
    setTodos(res);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTodo.trim()) return;
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTodo.trim(), date }),
    });
    const todo = await res.json();
    setTodos((prev) => [...prev, todo]);
    setNewTodo("");
  }

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

  async function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setExpandedId((current) => (current === id ? null : current));
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
  }

  const openTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  return (
    <main className="phase-in mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
        To-Do
      </h1>

      <div className="mb-6 flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface">
        <button
          onClick={() => setDate((d) => addDaysToDateStr(d, -1))}
          className="px-2 py-1 text-zinc-400 crimson:text-crimson-text-muted"
        >
          ←
        </button>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
          {formatDateLabel(date)}
        </span>
        <button
          onClick={() => setDate((d) => addDaysToDateStr(d, 1))}
          className="px-2 py-1 text-zinc-400 crimson:text-crimson-text-muted"
        >
          →
        </button>
      </div>

      <form onSubmit={addTodo} className="mb-6 flex gap-2">
        <input
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a to-do…"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 crimson:border-crimson-border crimson:bg-crimson-surface crimson:focus:border-crimson-accent"
        />
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
        >
          Add
        </button>
      </form>

      {loading ? (
        <LoadingSpinner />
      ) : todos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800 crimson:border-crimson-border crimson:text-crimson-text-muted">
          Nothing on the list for this day
        </div>
      ) : (
        <ul className="space-y-2">
          {[...openTodos, ...completedTodos].map((t) => (
            <li
              key={t.id}
              className="relative rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface crimson:before:absolute crimson:before:inset-y-2 crimson:before:left-0 crimson:before:w-1 crimson:before:rounded-full crimson:before:bg-crimson-accent"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleTodo(t)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    t.completed
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 crimson:border-crimson-accent crimson:bg-crimson-accent crimson:text-crimson-text"
                      : "border-zinc-300 dark:border-zinc-600 crimson:border-crimson-border"
                  }`}
                >
                  {t.completed && "✓"}
                </button>
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
                <button
                  onClick={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  className={`text-xs ${expandedId === t.id ? "text-zinc-600 dark:text-zinc-300 crimson:text-crimson-text-secondary" : "text-zinc-300 hover:text-zinc-500 crimson:text-crimson-text-muted crimson:hover:text-crimson-text-secondary"}`}
                  title="Attachments"
                >
                  📎
                </button>
                <button
                  onClick={() => deleteTodo(t.id)}
                  className="text-xs text-zinc-300 hover:text-red-500 crimson:text-crimson-text-secondary crimson:hover:text-crimson-accent"
                >
                  ✕
                </button>
              </div>
              {expandedId === t.id && (
                <div className="mt-3">
                  <AttachmentList linkedType="todo" linkedId={t.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
