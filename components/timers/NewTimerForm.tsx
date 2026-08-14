"use client";

import { useState } from "react";
import { Timer } from "./types";
import { parseDurationParts } from "@/lib/timers";

export default function NewTimerForm({
  defaultLabel = "",
  linkedType,
  linkedId,
  onCreated,
  onCancel,
}: {
  defaultLabel?: string;
  linkedType?: string;
  linkedId?: string;
  onCreated: (timer: Timer) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"stopwatch" | "countdown" | "pomodoro">("stopwatch");
  const [label, setLabel] = useState(defaultLabel);
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("25");
  const [seconds, setSeconds] = useState("0");
  const [workMinutes, setWorkMinutes] = useState("25");
  const [breakMinutes, setBreakMinutes] = useState("5");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    let durationSeconds: number | undefined;
    let workSeconds: number | undefined;
    let breakSeconds: number | undefined;

    if (mode === "countdown") {
      const total = parseDurationParts(hours, minutes, seconds);
      if (total == null) {
        setError("Enter a duration greater than 0");
        return;
      }
      durationSeconds = total;
    } else if (mode === "pomodoro") {
      const work = parseDurationParts("0", workMinutes, "0");
      const brk = parseDurationParts("0", breakMinutes, "0");
      if (work == null || brk == null) {
        setError("Enter work and break durations greater than 0");
        return;
      }
      workSeconds = work;
      breakSeconds = brk;
    }

    if (mode !== "stopwatch" && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    setSaving(true);
    try {
      const res = await fetch("/api/timers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || (mode === "countdown" ? "Countdown" : mode === "pomodoro" ? "Pomodoro" : "Stopwatch"),
          mode,
          durationSeconds,
          workSeconds,
          breakSeconds,
          linkedType,
          linkedId,
        }),
      });
      if (!res.ok) throw new Error();
      onCreated(await res.json());
    } catch {
      setError("Couldn't start timer. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex gap-1.5">
        {(["stopwatch", "countdown", "pomodoro"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
              mode === m
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
            }`}
          >
            {m === "stopwatch" ? "Stopwatch" : m === "countdown" ? "Countdown" : "Pomodoro"}
          </button>
        ))}
      </div>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Timer label (optional)"
        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
      />

      {mode === "countdown" && (
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-zinc-500">
            Hours
            <input
              type="number"
              min="0"
              step="1"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
          <label className="flex-1 text-xs text-zinc-500">
            Minutes
            <input
              type="number"
              min="0"
              step="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
          <label className="flex-1 text-xs text-zinc-500">
            Seconds
            <input
              type="number"
              min="0"
              step="1"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
        </div>
      )}

      {mode === "pomodoro" && (
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-zinc-500">
            Work (minutes)
            <input
              type="number"
              min="1"
              step="1"
              value={workMinutes}
              onChange={(e) => setWorkMinutes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
          <label className="flex-1 text-xs text-zinc-500">
            Break (minutes)
            <input
              type="number"
              min="1"
              step="1"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
        </div>
      )}

      {mode === "pomodoro" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          💡 We recommend running Pomodoro timers on a mobile device — work/break
          notifications are more reliable there than on desktop.
        </p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-zinc-900 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {saving ? "Starting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
