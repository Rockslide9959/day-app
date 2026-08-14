"use client";

import { dayLabel, eventCoversDate, formatTime12h, timeToMinutes, todayStr } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { categoryEventStyle } from "./categories";
import { CategoryDef } from "@/lib/calendar/categories";

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
              return (
                <li key={ev.occurrenceId}>
                  <button
                    onClick={() => onSelectEvent(ev)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  >
                    {isTask ? (
                      <span className="shrink-0 text-sm">{ev.completed ? "☑" : "☐"}</span>
                    ) : (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryEventStyle(ev.category, categories).backgroundColor }}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-medium ${
                          ev.completed ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"
                        }`}
                      >
                        {ev.title}
                      </span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {timeLabel}
                        {ev.category ? ` · ${ev.category}` : ""}
                      </span>
                    </span>
                    {(ev.priority === "high" || ev.priority === "urgent") && (
                      <span className="shrink-0">{ev.priority === "urgent" ? "🔴" : "🟠"}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
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
