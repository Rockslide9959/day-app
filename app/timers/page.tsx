"use client";

import { useCallback, useEffect, useState } from "react";
import { Timer } from "@/components/timers/types";
import TimerCard from "@/components/timers/TimerCard";
import NewTimerForm from "@/components/timers/NewTimerForm";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from "@/lib/push-client";

export default function TimersPage() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTimer, setShowNewTimer] = useState(false);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/timers").then((r) => r.json());
    setTimers(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    setPushSupported(isPushSupported());
    getExistingSubscription().then((sub) => setPushEnabled(Boolean(sub)));
  }, [load]);

  async function togglePush() {
    setPushBusy(true);
    setPushError("");
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        await subscribeToPush();
        setPushEnabled(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Something went wrong");
    }
    setPushBusy(false);
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

  const sortedTimers = [...timers].sort((a, b) =>
    (a.status === "completed") === (b.status === "completed") ? 0 : a.status === "completed" ? 1 : -1
  );

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Timers</h1>

      {pushSupported && (
        <div className="mb-6 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Notifications
            </p>
            <p className="text-xs text-zinc-500">
              {pushEnabled
                ? "On for this device — timers will notify you here even off this tab"
                : "Off — turn on to get notified when a timer ends"}
            </p>
            {pushError && <p className="mt-1 text-xs text-red-500">{pushError}</p>}
          </div>
          <button
            onClick={togglePush}
            disabled={pushBusy}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              pushEnabled
                ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                : "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
            }`}
          >
            {pushBusy ? "…" : pushEnabled ? "Turn off" : "Turn on"}
          </button>
        </div>
      )}

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
