"use client";

import { useEffect, useState, useCallback } from "react";
import { todayStr, formatDateLabel, addDaysToDateStr } from "@/lib/dates";
import AttachmentList from "@/components/attachments/AttachmentList";

type Todo = { id: string; title: string; completed: boolean };

export default function TodosPage() {
  const [date, setDate] = useState(todayStr());
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
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        To-Do
      </h1>

      <div className="mb-6 flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-zinc-900">
        <button
          onClick={() => setDate((d) => addDaysToDateStr(d, -1))}
          className="px-2 py-1 text-zinc-400"
        >
          ←
        </button>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {formatDateLabel(date)}
        </span>
        <button
          onClick={() => setDate((d) => addDaysToDateStr(d, 1))}
          className="px-2 py-1 text-zinc-400"
        >
          →
        </button>
      </div>

      <form onSubmit={addTodo} className="mb-6 flex gap-2">
        <input
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a to-do…"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : todos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          Nothing on the list for this day
        </div>
      ) : (
        <ul className="space-y-2">
          {[...openTodos, ...completedTodos].map((t) => (
            <li
              key={t.id}
              className="rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleTodo(t)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    t.completed
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {t.completed && "✓"}
                </button>
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
                <button
                  onClick={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  className={`text-xs ${expandedId === t.id ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-300 hover:text-zinc-500"}`}
                  title="Attachments"
                >
                  📎
                </button>
                <button
                  onClick={() => deleteTodo(t.id)}
                  className="text-xs text-zinc-300 hover:text-red-500"
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
