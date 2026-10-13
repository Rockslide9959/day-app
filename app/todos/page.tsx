"use client";

import { useEffect, useState, useCallback } from "react";
import { useSyncedDate, useTodayStr } from "@/lib/useTodayStr";
import AttachmentList from "@/components/attachments/AttachmentList";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useDataChanged } from "@/lib/useDataChanged";
import PageHeader from "@/components/ui/PageHeader";
import DateStepper from "@/components/ui/DateStepper";
import EmptyState from "@/components/ui/EmptyState";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, stagger } from "@/components/ui/styles";

type Todo = { id: string; title: string; completed: boolean; rolledOver: boolean };

export default function TodosPage() {
  const [date, setDate] = useSyncedDate();
  const today = useTodayStr();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/todos?date=${date}&today=${today}`).then((r) => r.json());
    setTodos(res);
    setLoading(false);
  }, [date, today]);

  useEffect(() => {
    load();
  }, [load]);
  // Refetch when Quick Add changes something while this page is open.
  useDataChanged(load);

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
  const ratio = todos.length ? completedTodos.length / todos.length : 0;
  const allDone = todos.length > 0 && openTodos.length === 0;

  return (
    <main className="phase-in mx-auto max-w-2xl px-4 pb-24 pt-8">
      <PageHeader
        eyebrow={date === today ? "Today" : date < today ? "Looking back" : "Planning ahead"}
        title="To-Do"
        subtitle={
          todos.length === 0
            ? "A clear list. Add something below."
            : allDone
              ? "Everything's done. Nice work! 🎉"
              : `${openTodos.length} left of ${todos.length}`
        }
      />

      <DateStepper date={date} today={today} onChange={setDate} className="mb-4" />

      {todos.length > 0 && (
        <div className={`${CARD} mb-4 px-5 py-4`}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className={SECTION_LABEL}>Progress</span>
            <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
              {Math.round(ratio * 100)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 crimson:bg-crimson-raised">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.21,0.9,0.32,1)] ${
                allDone
                  ? "bg-linear-to-r from-emerald-400 to-teal-500"
                  : "bg-linear-to-r from-violet-500 to-fuchsia-500 crimson:from-crimson-accent crimson:to-crimson-highlight"
              }`}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={addTodo} className={`${CARD} mb-6 flex items-center gap-2 py-1.5 pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-zinc-900/15 dark:focus-within:ring-white/25 crimson:focus-within:ring-crimson-accent/60`}>
        <span className="text-lg text-zinc-300 crimson:text-crimson-text-muted">＋</span>
        <input
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a to-do…"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50 crimson:text-crimson-text crimson:placeholder:text-crimson-text-muted"
        />
        <button
          type="submit"
          disabled={!newTodo.trim()}
          className={`${PRIMARY_BUTTON} px-4 py-2 text-xs`}
        >
          Add
        </button>
      </form>

      {loading ? (
        <LoadingSpinner />
      ) : todos.length === 0 ? (
        <EmptyState emoji="📝" title="Nothing on the list for this day" hint="Type above to add your first to-do." />
      ) : (
        <ul className="space-y-2">
          {[...openTodos, ...completedTodos].map((t, i) => (
            <li
              key={t.id}
              style={stagger(i)}
              className={`item-in relative overflow-hidden rounded-2xl px-4 py-3 shadow-sm ring-1 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 ${
                t.completed
                  ? "bg-white/60 ring-zinc-900/5 before:bg-emerald-400 dark:bg-zinc-900/60 dark:ring-white/5 crimson:bg-crimson-surface/60 crimson:ring-crimson-border crimson:before:bg-emerald-500"
                  : t.rolledOver
                    ? "bg-amber-50 ring-amber-200/60 before:bg-amber-400 dark:bg-amber-950/40 dark:ring-amber-900/40 crimson:bg-crimson-surface crimson:ring-crimson-border crimson:before:bg-amber-500"
                    : "bg-white ring-zinc-900/5 before:bg-violet-400 dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border crimson:before:bg-crimson-accent"
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleTodo(t)}
                  aria-label={t.completed ? `Mark not done: ${t.title}` : `Mark done: ${t.title}`}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold active:scale-90 ${
                    t.completed
                      ? "border-emerald-500 bg-emerald-500 text-white crimson:border-crimson-accent crimson:bg-crimson-accent crimson:text-crimson-text"
                      : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-600 dark:hover:border-zinc-400 crimson:border-crimson-border crimson:hover:border-crimson-accent"
                  }`}
                >
                  {t.completed && <span className="check-pop">✓</span>}
                </button>
                <span
                  onClick={() => toggleTodo(t)}
                  className={`flex-1 cursor-pointer text-sm transition-colors ${
                    t.completed
                      ? "text-zinc-400 line-through crimson:text-crimson-text-muted"
                      : t.rolledOver
                        ? "text-amber-800 dark:text-amber-300 crimson:text-crimson-text"
                        : "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
                  }`}
                >
                  {t.title}
                </span>
                <button
                  onClick={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 crimson:hover:bg-crimson-raised ${expandedId === t.id ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 crimson:bg-crimson-raised crimson:text-crimson-text-secondary" : "text-zinc-300 hover:text-zinc-500 crimson:text-crimson-text-muted crimson:hover:text-crimson-text-secondary"}`}
                  title="Attachments"
                >
                  📎
                </button>
                <button
                  onClick={() => deleteTodo(t.id)}
                  aria-label={`Delete ${t.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs text-zinc-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 crimson:text-crimson-text-secondary crimson:hover:bg-crimson-accent/15 crimson:hover:text-crimson-accent"
                >
                  ✕
                </button>
              </div>
              {expandedId === t.id && (
                <div className="item-in mt-3">
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
