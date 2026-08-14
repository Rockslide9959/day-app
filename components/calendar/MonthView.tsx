"use client";

import { getMonthGrid, isSameMonth, todayStr } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { categoryEventStyle } from "./categories";
import { CategoryDef } from "@/lib/calendar/categories";

export default function MonthView({
  anchorDate,
  events,
  categories,
  onSelectDate,
  onSelectEvent,
}: {
  anchorDate: string;
  events: CalendarEvent[];
  categories: CategoryDef[];
  onSelectDate: (date: string) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const weeks = getMonthGrid(anchorDate);
  const today = todayStr();

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const start = ev.date;
    const end = ev.endDate || ev.date;
    // Cap fan-out for very long ranges so a stray year-long event can't
    // blow up the grid.
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard < 42) {
      if (!eventsByDate.has(cursor)) eventsByDate.set(cursor, []);
      eventsByDate.get(cursor)!.push(ev);
      cursor = new Date(new Date(cursor).getTime() + 86400000).toISOString().slice(0, 10);
      guard++;
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-7 border-b border-zinc-200 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
          <div key={i} className="py-2.5">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((date) => {
          const dayEvents = eventsByDate.get(date) || [];
          const inMonth = isSameMonth(date, anchorDate);
          const isToday = date === today;
          const maxVisible = 3;
          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              className={`flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-zinc-200 p-1 text-left last:border-r-0 sm:min-h-[112px] sm:p-1.5 dark:border-zinc-800 ${
                inMonth ? "bg-white dark:bg-zinc-900" : "bg-zinc-50 dark:bg-zinc-950"
              }`}
            >
              <span
                className={`self-start px-1.5 py-0.5 text-xs font-semibold sm:text-sm ${
                  isToday
                    ? "rounded-full bg-red-500 text-white"
                    : inMonth
                      ? "text-zinc-700 dark:text-zinc-200"
                      : "text-zinc-400 dark:text-zinc-600"
                }`}
              >
                {Number(date.slice(8, 10))}
              </span>
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, maxVisible).map((ev) => (
                  <span
                    key={ev.occurrenceId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(ev);
                    }}
                    style={ev.completed ? undefined : categoryEventStyle(ev.category, categories)}
                    className={`flex items-center gap-1 truncate rounded px-1.5 py-1 text-[11px] font-medium leading-tight sm:text-xs ${
                      ev.completed
                        ? "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500"
                        : "hover:opacity-90"
                    }`}
                  >
                    <span className="truncate">{ev.title}</span>
                    {(ev.priority === "high" || ev.priority === "urgent") && <span>{ev.priority === "urgent" ? "🔴" : "🟠"}</span>}
                  </span>
                ))}
                {dayEvents.length > maxVisible && (
                  <span className="px-1.5 text-[11px] font-semibold text-zinc-500 sm:text-xs dark:text-zinc-400">
                    +{dayEvents.length - maxVisible} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
