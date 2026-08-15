"use client";

import { getMonthGrid, isSameMonth, todayStr } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { CategoryDef } from "@/lib/calendar/categories";
import { buildItemAriaLabel, getItemVisualStyle, moreIndicatorLabel, priorityDotInfo } from "@/lib/calendar/itemDisplay";
import CalendarItemChip from "./CalendarItemChip";

export default function MonthView({
  anchorDate,
  events,
  categories,
  journalDates,
  onSelectDate,
  onSelectEvent,
}: {
  anchorDate: string;
  events: CalendarEvent[];
  categories: CategoryDef[];
  // Dates (within the visible range) that have a journal entry — metadata
  // only, never entry content. Optional so callers that don't fetch it
  // simply render no indicators.
  journalDates?: Set<string>;
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
          const remaining = dayEvents.length - maxVisible;
          const moreLabel = remaining > 0 ? moreIndicatorLabel(remaining) : null;

          return (
            // A div (not a <button>) so the per-item buttons below aren't
            // nested inside a button, which is invalid HTML and breaks
            // keyboard access to individual items. role="button" + the key
            // handler make the cell itself a valid custom control for
            // "select this date", while each item keeps its own real
            // <button> for "select this item".
            <div
              key={date}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDate(date)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDate(date);
                }
              }}
              aria-label={`${date}${dayEvents.length > 0 ? `, ${dayEvents.length} item${dayEvents.length === 1 ? "" : "s"}` : ""}`}
              className={`flex min-h-[92px] cursor-pointer flex-col items-stretch gap-1 border-b border-r border-zinc-200 p-1 text-left last:border-r-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 sm:min-h-[112px] sm:p-1.5 dark:border-zinc-800 ${
                inMonth ? "bg-white dark:bg-zinc-900" : "bg-zinc-50 dark:bg-zinc-950"
              }`}
            >
              <span className="flex items-center gap-1 self-start">
                <span
                  className={`px-1.5 py-0.5 text-xs font-semibold sm:text-sm ${
                    isToday
                      ? "rounded-full bg-red-500 text-white"
                      : inMonth
                        ? "text-zinc-700 dark:text-zinc-200"
                        : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {Number(date.slice(8, 10))}
                </span>
                {journalDates?.has(date) && (
                  <span className="text-[10px]" aria-label="Has a journal entry" title="Has a journal entry">
                    📓
                  </span>
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, maxVisible).map((ev) => {
                  const visual = getItemVisualStyle(ev, categories);
                  const dot = priorityDotInfo(ev.priority);
                  return (
                    <button
                      key={ev.occurrenceId}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      aria-label={buildItemAriaLabel(ev)}
                      className="block min-w-0 text-left"
                    >
                      <CalendarItemChip
                        visual={visual}
                        title={ev.title}
                        completed={ev.completed}
                        dot={dot}
                        dense
                      />
                    </button>
                  );
                })}
                {moreLabel && (
                  <span className="whitespace-nowrap px-1 text-[11px] font-semibold text-zinc-500 sm:text-xs dark:text-zinc-400">
                    <span className="sm:hidden">{moreLabel.compact}</span>
                    <span className="hidden sm:inline">{moreLabel.full}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
