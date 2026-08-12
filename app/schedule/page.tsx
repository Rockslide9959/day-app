"use client";

import { useEffect, useState, useCallback } from "react";
import { todayStr, formatDateLabel, addDaysToDateStr } from "@/lib/dates";

type ScheduleItem = {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  startTime: string;
  endTime: string;
};

export default function SchedulePage() {
  const [date, setDate] = useState(todayStr());
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/schedule?date=${date}`).then((r) => r.json());
    setItems(res);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, notes, date, startTime, endTime }),
    });
    const item = await res.json();
    setItems((prev) => [...prev, item].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    setTitle("");
    setNotes("");
    setShowForm(false);
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/schedule/${id}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Schedule
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

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          Nothing scheduled for this day
        </div>
      ) : (
        <ul className="mb-6 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
            >
              <span className="w-20 shrink-0 pt-0.5 text-xs font-medium text-zinc-500">
                {item.startTime}–{item.endTime}
              </span>
              <div className="flex-1">
                <p className="text-sm text-zinc-900 dark:text-zinc-50">{item.title}</p>
                {item.notes && <p className="text-xs text-zinc-500">{item.notes}</p>}
              </div>
              <button
                onClick={() => deleteItem(item.id)}
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
          onSubmit={addItem}
          className="space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900"
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's happening?"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-zinc-500">
              Start
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="flex-1 text-xs text-zinc-500">
              End
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
          </div>
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
              Add to schedule
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
          + Add time block
        </button>
      )}
    </main>
  );
}
