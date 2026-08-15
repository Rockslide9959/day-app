"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, eventCoversDate, formatTime12h, timeToMinutes, todayStr } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { CategoryDef } from "@/lib/calendar/categories";
import { NotebookEntryFull } from "@/components/notebook/types";
import { buildContentPreview } from "@/lib/notebookFormat";
import { buildItemAriaLabel, getItemVisualStyle, priorityDotInfo } from "@/lib/calendar/itemDisplay";
import { DASHED_TASK_OVERLAY_CLASS } from "./CalendarItemChip";

export default function DayAgendaModal({
  date,
  events,
  categories,
  onClose,
  onSelectEvent,
  onAddEvent,
}: {
  date: string;
  events: CalendarEvent[];
  categories: CategoryDef[];
  onClose: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onAddEvent: (date: string) => void;
}) {
  const router = useRouter();
  const [journalEntry, setJournalEntry] = useState<NotebookEntryFull | null | undefined>(undefined);
  const [creatingJournal, setCreatingJournal] = useState(false);

  // Independent of the events/tasks already passed in via props — a
  // notebook fetch failure (or just slowness) never blocks the agenda
  // list that's already available from `events`.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebook/daily?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setJournalEntry(data);
      })
      .catch(() => {
        // Leave as undefined — the Journal area just stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function writeAboutThisDay() {
    if (journalEntry) {
      router.push(`/notebook/${journalEntry.id}`);
      return;
    }
    setCreatingJournal(true);
    try {
      const res = await fetch("/api/notebook/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) throw new Error("Request failed");
      const entry = await res.json();
      router.push(`/notebook/${entry.id}`);
    } catch {
      setCreatingJournal(false);
    }
  }

  const dayEvents = events
    .filter((ev) => eventCoversDate(ev.date, ev.endDate, date))
    .sort((a, b) => {
      const aAllDay = a.allDay || a.date !== (a.endDate || a.date);
      const bAllDay = b.allDay || b.date !== (b.endDate || b.date);
      if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

  const isToday = date === todayStr();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg sm:max-w-md sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{dayLabel(date)}</h2>
            {isToday && <p className="text-xs font-medium text-red-500">Today</p>}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Close">
            ✕
          </button>
        </div>

        {dayEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
            No events on this day
          </p>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {dayEvents.map((ev) => {
              const isTask = ev.itemType === "task";
              const isMultiOrAllDay = ev.allDay || ev.date !== (ev.endDate || ev.date);
              const timeLabel = isTask
                ? ev.allDay
                  ? "Due today"
                  : `Due ${formatTime12h(ev.startTime)}`
                : isMultiOrAllDay
                  ? "All day"
                  : `${formatTime12h(ev.startTime)} – ${formatTime12h(ev.endTime)}`;
              const visual = getItemVisualStyle(ev, categories);
              const dot = priorityDotInfo(ev.priority);
              return (
                <li key={ev.occurrenceId}>
                  <button
                    onClick={() => onSelectEvent(ev)}
                    aria-label={buildItemAriaLabel(ev, timeLabel)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  >
                    <span
                      aria-hidden="true"
                      style={{ backgroundColor: visual.background, color: visual.color }}
                      className={`relative h-8 w-8 shrink-0 rounded-md ${visual.dashed ? DASHED_TASK_OVERLAY_CLASS : ""}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-medium ${
                          ev.completed ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"
                        }`}
                      >
                        {ev.title}
                      </span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {isTask ? "Task" : "Event"} · {timeLabel}
                        {ev.category ? ` · ${ev.category}` : ""}
                        {ev.completed ? " · Completed" : ""}
                      </span>
                    </span>
                    {dot && (
                      <span
                        aria-hidden="true"
                        title={dot.label}
                        className={`h-2 w-2 shrink-0 rounded-full ${dot.color === "red" ? "bg-red-500" : "bg-orange-500"}`}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {journalEntry !== undefined && (
          <div className="mb-4">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Journal</h3>
            {journalEntry ? (
              <button
                onClick={writeAboutThisDay}
                className="w-full rounded-xl bg-zinc-50 px-3 py-2.5 text-left dark:bg-zinc-800/60"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{journalEntry.title}</p>
                {journalEntry.content && (
                  <p className="truncate text-xs text-zinc-500">{buildContentPreview(journalEntry.content, 100)}</p>
                )}
                <span className="mt-1 inline-block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Open entry →
                </span>
              </button>
            ) : (
              <button
                onClick={writeAboutThisDay}
                disabled={creatingJournal}
                className="w-full rounded-xl border border-dashed border-zinc-200 py-2.5 text-sm font-medium text-zinc-500 disabled:opacity-60 dark:border-zinc-700"
              >
                {creatingJournal ? "Opening…" : "📓 Write about this day"}
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => onAddEvent(date)}
          className="w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Add item
        </button>
      </div>
    </div>
  );
}
