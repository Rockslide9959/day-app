"use client";

import { useEffect, useMemo, useState } from "react";
import { addDaysToDateStr, formatTime12h, todayStr } from "@/lib/dates";
import { busySlotsFromEvents, findFreeSlots, formatDuration } from "@/lib/calendar/freeTime";
import { remainingStudyHours } from "@/lib/calendar/studyPlanner";
import { isDeadlineCategory } from "@/lib/calendar/categories";
import { CalendarEvent } from "./types";

const DURATIONS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
];

type Tab = "free" | "study";

export default function FreeTimeFinder({
  events,
  onClose,
}: {
  events: CalendarEvent[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("free");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg sm:max-w-md sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
            {(["free", "study"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  tab === t ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50" : "text-zinc-500"
                }`}
              >
                {t === "free" ? "Free Time" : "Study Plan"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            ✕
          </button>
        </div>

        {tab === "free" ? <FreeTimeTab events={events} /> : <StudyPlanTab />}
      </div>
    </div>
  );
}

function FreeTimeTab({ events }: { events: CalendarEvent[] }) {
  const [date, setDate] = useState(todayStr());
  const [duration, setDuration] = useState(60);

  const slots = useMemo(() => {
    const busy = busySlotsFromEvents(events, date);
    return findFreeSlots(busy, duration);
  }, [events, date, duration]);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Find Free Time</h2>
      <div className="flex gap-3">
        <label className="flex-1 text-xs text-zinc-500">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </label>
        <label className="flex-1 text-xs text-zinc-500">
          Duration
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            {DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {slots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          No {formatDuration(duration)} gaps found that day (between 7 AM–10 PM)
        </p>
      ) : (
        <ul className="space-y-2">
          {slots.map((s, i) => (
            <li key={i} className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60">
              <span className="text-sm text-zinc-900 dark:text-zinc-50">
                {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
              </span>
              <span className="text-xs text-zinc-500">{formatDuration(s.minutes)} available</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StudyPlanTab() {
  const [assessments, setAssessments] = useState<CalendarEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [scheduledHours, setScheduledHours] = useState(0);
  const [suggestions, setSuggestions] = useState<{ date: string; startTime: string; endTime: string; minutes: number }[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = todayStr();
      const to = addDaysToDateStr(today, 90);
      try {
        const res = await fetch(`/api/schedule?from=${today}&to=${to}`);
        const data: CalendarEvent[] = await res.json();
        const upcoming = data.filter((e) => isDeadlineCategory(e.category) && e.estimatedHours != null);
        setAssessments(upcoming);
        if (upcoming.length > 0) setSelectedId(upcoming[0].id);
      } catch {
        // leave empty — the tab just shows "no assessments" below
      }
      setLoading(false);
    })();
  }, []);

  const selected = assessments.find((a) => a.id === selectedId);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const today = todayStr();
      try {
        const res = await fetch(`/api/schedule?from=${today}&to=${selected.date}`);
        const data: CalendarEvent[] = await res.json();

        const studyMinutes = data
          .filter((e) => e.category === "Study" && e.subject === selected.subject && !e.allDay)
          .reduce((sum, e) => {
            const [sh, sm] = e.startTime.split(":").map(Number);
            const [eh, em] = e.endTime.split(":").map(Number);
            return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
          }, 0);
        setScheduledHours(Math.round((studyMinutes / 60) * 10) / 10);

        const remaining = remainingStudyHours(selected.estimatedHours || 0, studyMinutes / 60);
        if (remaining <= 0) {
          setSuggestions([]);
          return;
        }

        // Scan each day between today and the deadline for a usable gap.
        const byDate = new Map<string, CalendarEvent[]>();
        for (const e of data) {
          if (e.allDay) continue;
          if (!byDate.has(e.date)) byDate.set(e.date, []);
          byDate.get(e.date)!.push(e);
        }
        const found: { date: string; startTime: string; endTime: string; minutes: number }[] = [];
        let cursor = today;
        while (cursor <= selected.date && found.length < 5) {
          const busy = (byDate.get(cursor) || []).map((e) => ({ startTime: e.startTime, endTime: e.endTime }));
          const slots = findFreeSlots(busy, 60);
          for (const s of slots) {
            if (found.length < 5) found.push({ date: cursor, ...s });
          }
          cursor = addDaysToDateStr(cursor, 1);
        }
        setSuggestions(found);
      } catch {
        setSuggestions([]);
      }
    })();
  }, [selected]);

  async function approveSlot(slot: { date: string; startTime: string; endTime: string }) {
    if (!selected) return;
    const key = `${slot.date}-${slot.startTime}`;
    setCreating(key);
    try {
      await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Study: ${selected.subject || selected.title}`,
          notes: `Suggested study session for "${selected.title}"`,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          category: "Study",
          subject: selected.subject,
        }),
      });
      setCreated((prev) => new Set(prev).add(key));
    } catch {
      // silently leave it un-created; user can just try again
    }
    setCreating(null);
  }

  if (loading) return <p className="text-sm text-zinc-400">Loading…</p>;

  if (assessments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
        No upcoming Assignment/Test/Exam events with estimated hours set yet. Add estimated hours
        when creating one to plan study time for it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Plan Study Time</h2>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
      >
        {assessments.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title} — due {a.date}
          </option>
        ))}
      </select>

      {selected && (
        <>
          <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
            {selected.estimatedHours}h estimated · {scheduledHours}h already scheduled ·{" "}
            <span className="font-medium">
              {remainingStudyHours(selected.estimatedHours || 0, scheduledHours)}h remaining
            </span>
          </div>

          {suggestions.length === 0 ? (
            <p className="text-sm text-zinc-400">
              {remainingStudyHours(selected.estimatedHours || 0, scheduledHours) <= 0
                ? "You've already scheduled enough study time for this."
                : "No free slots found before the deadline."}
            </p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((s) => {
                const key = `${s.date}-${s.startTime}`;
                const isCreated = created.has(key);
                return (
                  <li key={key} className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60">
                    <div>
                      <p className="text-sm text-zinc-900 dark:text-zinc-50">{s.date}</p>
                      <p className="text-xs text-zinc-500">
                        {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                      </p>
                    </div>
                    <button
                      onClick={() => approveSlot(s)}
                      disabled={creating === key || isCreated}
                      className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                    >
                      {isCreated ? "Added ✓" : creating === key ? "Adding…" : "Add to calendar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
