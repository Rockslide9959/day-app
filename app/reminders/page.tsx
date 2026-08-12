"use client";

import { useEffect, useState } from "react";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from "@/lib/push-client";

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string;
  recurrence: string;
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: "Once",
  daily: "Every day",
  weekly: "Every week",
  weekdays: "Weekdays",
};

function defaultDueAt() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt());
  const [recurrence, setRecurrence] = useState("none");

  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/reminders").then((r) => r.json());
    setReminders(res);
    setLoading(false);
  }

  useEffect(() => {
    load();
    setPushSupported(isPushSupported());
    getExistingSubscription().then((sub) => setPushEnabled(Boolean(sub)));
  }, []);

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

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        notes,
        dueAt: new Date(dueAt).toISOString(),
        recurrence,
      }),
    });
    const reminder = await res.json();
    setReminders((prev) =>
      [...prev, reminder].sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      )
    );
    setTitle("");
    setNotes("");
    setDueAt(defaultDueAt());
    setRecurrence("none");
    setShowForm(false);
  }

  async function completeReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
  }

  async function deleteReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
  }

  const now = new Date();

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Reminders
      </h1>

      {pushSupported && (
        <div className="mb-6 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Notifications
            </p>
            <p className="text-xs text-zinc-500">
              {pushEnabled ? "On for this device" : "Off — turn on to get reminded"}
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
      ) : reminders.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          No reminders set
        </div>
      ) : (
        <ul className="mb-6 space-y-2">
          {reminders.map((r) => {
            const due = new Date(r.dueAt);
            const overdue = due <= now;
            return (
              <li
                key={r.id}
                className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-sm ${
                  overdue
                    ? "bg-red-50 dark:bg-red-950/40"
                    : "bg-white dark:bg-zinc-900"
                }`}
              >
                <button
                  onClick={() => completeReminder(r.id)}
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs dark:border-zinc-600"
                  title="Mark done"
                >
                  ✓
                </button>
                <div className="flex-1">
                  <p className="text-sm text-zinc-900 dark:text-zinc-50">{r.title}</p>
                  {r.notes && <p className="text-xs text-zinc-500">{r.notes}</p>}
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {due.toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {r.recurrence !== "none" && ` · ${RECURRENCE_LABELS[r.recurrence]}`}
                  </p>
                </div>
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="text-xs text-zinc-300 hover:text-red-500"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showForm ? (
        <form
          onSubmit={addReminder}
          className="space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900"
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Remind me to…"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Set reminder
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
          + New reminder
        </button>
      )}
    </main>
  );
}
