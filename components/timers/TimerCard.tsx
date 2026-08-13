"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "./types";
import { elapsedSeconds, formatClock, isCountdownComplete, remainingSeconds } from "@/lib/timers";

export default function TimerCard({
  timer,
  showLink = true,
  onUpdated,
  onDeleted,
}: {
  timer: Timer;
  // Hide the "🔗 Linked to…" line when the card is already shown inside
  // the linked item's own detail view (context is obvious there).
  showLink?: boolean;
  onUpdated: (timer: Timer) => void;
  onDeleted: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const completingRef = useRef(false);

  useEffect(() => {
    if (timer.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer.status]);

  useEffect(() => {
    completingRef.current = false;
  }, [timer.status, timer.startedAt]);

  const elapsed = elapsedSeconds(timer, now);
  const remaining = remainingSeconds(timer, now);
  const done = isCountdownComplete(timer, now);

  useEffect(() => {
    if (!done || completingRef.current) return;
    completingRef.current = true;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification("Timer finished", { body: timer.label, tag: `timer-${timer.id}` });
    }
    patch("complete");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  async function patch(action: "start" | "pause" | "reset" | "complete") {
    setBusy(true);
    try {
      const res = await fetch(`/api/timers/${timer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) onUpdated(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/timers/${timer.id}`, { method: "DELETE" });
      onDeleted(timer.id);
    } finally {
      setBusy(false);
    }
  }

  const isCountdown = timer.mode === "countdown";
  const display = isCountdown ? formatClock(remaining) : formatClock(elapsed);
  const progress =
    isCountdown && timer.durationSeconds ? Math.min(1, elapsed / timer.durationSeconds) : null;
  const isDone = timer.status === "completed";

  return (
    <div
      className={`rounded-xl px-4 py-3 shadow-sm ${
        isDone ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-white dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{timer.label}</p>
          <p className="text-xs text-zinc-500">
            {isCountdown ? "Countdown" : "Stopwatch"}
            {isDone && " · Done"}
            {showLink && timer.linkedType && ` · 🔗 Linked to ${timer.linkedType === "schedule" ? "event" : "to-do"}`}
          </p>
        </div>
        <span
          className={`shrink-0 font-mono text-lg tabular-nums ${
            isDone ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-900 dark:text-zinc-50"
          }`}
        >
          {display}
        </span>
      </div>

      {progress != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-zinc-900 dark:bg-zinc-50"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      <div className="mt-2 flex gap-2">
        {!isDone &&
          (timer.status === "running" ? (
            <button
              onClick={() => patch("pause")}
              disabled={busy}
              className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => patch("start")}
              disabled={busy}
              className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Start
            </button>
          ))}
        <button
          onClick={() => patch("reset")}
          disabled={busy}
          className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
        >
          Reset
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="ml-auto rounded-lg px-2 py-1 text-xs text-zinc-300 hover:text-red-500 disabled:opacity-40"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
