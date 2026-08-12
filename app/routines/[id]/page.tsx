"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { todayStr } from "@/lib/dates";

type Step = { id: string; title: string; sortOrder: number };
type Routine = { id: string; name: string; icon: string; steps: Step[] };

export default function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStep, setNewStep] = useState("");
  const [editing, setEditing] = useState(false);
  const today = todayStr();

  async function load() {
    setLoading(true);
    const [routines, run] = await Promise.all([
      fetch("/api/routines").then((r) => r.json()),
      fetch(`/api/routines/${id}/run?date=${today}`).then((r) => r.json()),
    ]);
    setRoutine(routines.find((r: Routine) => r.id === id) || null);
    setCompletedStepIds(run.completedStepIds);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleStep(stepId: string) {
    setCompletedStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((s) => s !== stepId) : [...prev, stepId]
    );
    const res = await fetch(`/api/routines/${id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId, date: today }),
    }).then((r) => r.json());
    setCompletedStepIds(res.completedStepIds);
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (!newStep.trim() || !routine) return;
    const res = await fetch(`/api/routines/${id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newStep.trim() }),
    });
    const step = await res.json();
    setRoutine({ ...routine, steps: [...routine.steps, step] });
    setNewStep("");
  }

  async function deleteStep(stepId: string) {
    if (!routine) return;
    setRoutine({ ...routine, steps: routine.steps.filter((s) => s.id !== stepId) });
    await fetch(`/api/routines/${id}/steps/${stepId}`, { method: "DELETE" });
  }

  if (loading || !routine) {
    return <div className="p-6 text-sm text-zinc-400">Loading…</div>;
  }

  const doneCount = routine.steps.filter((s) => completedStepIds.includes(s.id)).length;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <Link href="/routines" className="mb-4 inline-block text-sm text-zinc-400">
        ← Routines
      </Link>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        <span>{routine.icon}</span>
        {routine.name}
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        {doneCount}/{routine.steps.length} done today
      </p>

      {routine.steps.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          No steps yet — add some below
        </div>
      ) : (
        <ul className="mb-6 space-y-2">
          {routine.steps.map((step) => {
            const done = completedStepIds.includes(step.id);
            return (
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
              >
                <button
                  onClick={() => toggleStep(step.id)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                    done
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {done && "✓"}
                </button>
                <span
                  onClick={() => toggleStep(step.id)}
                  className={`flex-1 text-sm ${
                    done ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"
                  }`}
                >
                  {step.title}
                </span>
                {editing && (
                  <button
                    onClick={() => deleteStep(step.id)}
                    className="text-xs text-zinc-300 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <form onSubmit={addStep} className="mb-3 flex gap-2">
          <input
            autoFocus
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="Add a step…"
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Add
          </button>
        </form>
      ) : null}

      <button
        onClick={() => setEditing((e) => !e)}
        className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 dark:border-zinc-700"
      >
        {editing ? "Done editing" : "Edit steps"}
      </button>
    </main>
  );
}
