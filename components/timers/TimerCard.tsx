"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "./types";
import { elapsedSeconds, formatClock, isPhaseComplete, phaseDurationSeconds, remainingSeconds } from "@/lib/timers";

// Best-effort only — must never throw. This app always has an active
// service worker registered (for push), and Chrome refuses a direct
// `new Notification()` call in that case ("Illegal constructor"), so we
// go through the service worker's showNotification when we can and fall
// back otherwise. A failure here must never stop the caller from
// persisting the timer's next state — the in-page display is the alert
// that always works regardless of notification support.
async function notify(title: string, body: string, timerId: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
      return;
    }
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag: `timer-${timerId}` });
        return;
      }
    }
    new Notification(title, { body, tag: `timer-${timerId}` });
  } catch {
    // Ignored — see comment above.
  }
}

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
  }, [timer.status, timer.startedAt, timer.phase]);

  const elapsed = elapsedSeconds(timer, now);
  const remaining = remainingSeconds(timer, now);
  const duration = phaseDurationSeconds(timer);
  const done = isPhaseComplete(timer, now);
  const isPomodoro = timer.mode === "pomodoro";
  const isBreak = isPomodoro && timer.phase === "break";

  useEffect(() => {
    if (!done || completingRef.current) return;
    completingRef.current = true;
    if (isPomodoro) {
      const goingToBreak = timer.phase !== "break";
      notify(
        goingToBreak ? "Work session done" : "Break's over",
        goingToBreak ? `Take a break — ${timer.label}` : `Back to work — ${timer.label}`,
        timer.id
      );
      patch("auto-advance-phase");
    } else {
      notify("Timer finished", timer.label, timer.id);
      patch("complete");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  async function patch(action: "start" | "pause" | "reset" | "complete" | "advance-phase" | "auto-advance-phase") {
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

  const display = duration != null ? formatClock(remaining) : formatClock(elapsed);
  const progress = duration != null ? Math.min(1, elapsed / duration) : null;
  const isDone = timer.status === "completed";

  const accent = isDone ? "emerald" : isBreak ? "sky" : null;

  const modeLabel = timer.mode === "stopwatch" ? "Stopwatch" : timer.mode === "countdown" ? "Countdown" : isBreak ? "Pomodoro · Break" : "Pomodoro · Work";

  return (
    <div
      className={`rounded-xl px-4 py-3 shadow-sm ${
        accent === "emerald"
          ? "bg-emerald-50 dark:bg-emerald-950/30"
          : accent === "sky"
            ? "bg-sky-50 dark:bg-sky-950/30"
            : "bg-white dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{timer.label}</p>
          <p className="text-xs text-zinc-500">
            {modeLabel}
            {isDone && " · Done"}
            {isPomodoro && timer.cyclesCompleted > 0 && ` · ${timer.cyclesCompleted} round${timer.cyclesCompleted === 1 ? "" : "s"} done`}
            {showLink && timer.linkedType && ` · 🔗 Linked to ${timer.linkedType === "schedule" ? "event" : "to-do"}`}
          </p>
        </div>
        <span
          className={`shrink-0 font-mono text-lg tabular-nums ${
            accent === "emerald"
              ? "text-emerald-700 dark:text-emerald-300"
              : accent === "sky"
                ? "text-sky-700 dark:text-sky-300"
                : "text-zinc-900 dark:text-zinc-50"
          }`}
        >
          {display}
        </span>
      </div>

      {progress != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full ${
              accent === "emerald" ? "bg-emerald-500" : accent === "sky" ? "bg-sky-500" : "bg-zinc-900 dark:bg-zinc-50"
            }`}
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
        {isPomodoro && !isDone && (
          <button
            onClick={() => patch("advance-phase")}
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
          >
            Skip
          </button>
        )}
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
