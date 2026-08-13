"use client";

import { useCallback, useEffect, useState } from "react";
import { Timer } from "@/components/timers/types";
import TimerCard from "@/components/timers/TimerCard";
import NewTimerForm from "@/components/timers/NewTimerForm";

export default function TimersPage() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTimer, setShowNewTimer] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/timers").then((r) => r.json());
    setTimers(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function upsertTimer(timer: Timer) {
    setTimers((prev) => {
      const exists = prev.some((t) => t.id === timer.id);
      return exists ? prev.map((t) => (t.id === timer.id ? timer : t)) : [timer, ...prev];
    });
  }

  function removeTimer(id: string) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }

  const sortedTimers = [...timers].sort((a, b) =>
    (a.status === "completed") === (b.status === "completed") ? 0 : a.status === "completed" ? 1 : -1
  );

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Timers</h1>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : sortedTimers.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          No timers yet — start a stopwatch, countdown, or a focus session
        </div>
      ) : (
        <ul className="mb-6 space-y-2">
          {sortedTimers.map((t) => (
            <li key={t.id}>
              <TimerCard timer={t} onUpdated={upsertTimer} onDeleted={removeTimer} />
            </li>
          ))}
        </ul>
      )}

      {showNewTimer ? (
        <NewTimerForm
          onCreated={(t) => {
            upsertTimer(t);
            setShowNewTimer(false);
          }}
          onCancel={() => setShowNewTimer(false)}
        />
      ) : (
        <button
          onClick={() => setShowNewTimer(true)}
          className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 dark:border-zinc-700"
        >
          + New timer
        </button>
      )}
    </main>
  );
}
