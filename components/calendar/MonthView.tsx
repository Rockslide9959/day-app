"use client";

import { getMonthGrid, isSameMonth, todayStr } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { categoryDotStyle } from "./categories";
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
    <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-zinc-900">
      <div className="grid grid-cols-7 border-b border-zinc-100 text-center text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-2.5">
            {d}
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
              className={`flex min-h-[84px] flex-col items-stretch gap-1 border-b border-r border-zinc-100 p-1 text-left last:border-r-0 sm:min-h-[104px] sm:p-1.5 dark:border-zinc-800 ${
                inMonth ? "" : "opacity-40"
              }`}
            >
              <span
                className={`self-start px-1.5 py-0.5 text-xs font-medium sm:text-sm ${
                  isToday
                    ? "rounded-full bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {Number(date.slice(8, 10))}
              </span>
              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, maxVisible).map((ev) => (
                  <span
                    key={ev.occurrenceId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(ev);
                    }}
                    className={`flex items-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px] leading-tight hover:bg-zinc-100 sm:text-xs dark:hover:bg-zinc-800 ${
                      ev.completed ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={categoryDotStyle(ev.category, categories)} />
                    <span className="truncate">{ev.title}</span>
                    {(ev.priority === "high" || ev.priority === "urgent") && <span>{ev.priority === "urgent" ? "🔴" : "🟠"}</span>}
                  </span>
                ))}
                {dayEvents.length > maxVisible && (
                  <span className="px-1.5 text-[11px] font-medium text-zinc-400 sm:text-xs">
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
