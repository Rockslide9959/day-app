"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Routine = { id: string; name: string; icon: string; steps: { id: string }[] };

const ICONS = ["✅", "☀️", "🌙", "💪", "🧘", "📚", "🧹", "🍳"];

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/routines").then((r) => r.json());
    setRoutines(res);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addRoutine(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon }),
    });
    const routine = await res.json();
    setRoutines((prev) => [...prev, { ...routine, steps: [] }]);
    setName("");
    setIcon(ICONS[0]);
    setShowForm(false);
  }

  async function deleteRoutine(id: string) {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/routines/${id}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Routines
      </h1>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : routines.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          No routines yet — set up a morning or evening checklist
        </div>
      ) : (
        <ul className="mb-6 space-y-2">
          {routines.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <Link
                href={`/routines/${r.id}`}
                className="flex flex-1 items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
              >
                <span className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
                  <span className="text-lg">{r.icon}</span>
                  {r.name}
                </span>
                <span className="text-xs text-zinc-400">{r.steps.length} steps</span>
              </Link>
              <button
                onClick={() => deleteRoutine(r.id)}
                className="text-xs text-zinc-300 hover:text-red-500"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form
          onSubmit={addRoutine}
          className="space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Routine name, e.g. Morning routine"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div className="flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button
                type="button"
                key={i}
                onClick={() => setIcon(i)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
                  icon === i
                    ? "bg-zinc-900 dark:bg-zinc-50"
                    : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Create routine
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-zinc-200 px-4 text-sm text-zinc-500 dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 dark:border-zinc-700"
        >
          + New routine
        </button>
      )}
    </main>
  );
}
