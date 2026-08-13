"use client";

import { useEffect, useRef } from "react";
import { dayLabel, timeToMinutes, todayStr } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { categoryDotStyle } from "./categories";
import { CategoryDef } from "@/lib/calendar/categories";

const HOUR_HEIGHT = 60; // px per hour
const GUTTER_WIDTH = 52; // px, hour-label column
const MIN_EVENT_MINUTES = 30; // minimum visual block height, for tap targets
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(h: number) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export default function TimeGrid({
  dates,
  events,
  categories,
  onSelectSlot,
  onSelectEvent,
}: {
  dates: string[];
  events: CalendarEvent[];
  categories: CategoryDef[];
  onSelectSlot: (date: string, time: string) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayStr();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT });
  }, []);

  const eventsByDate = new Map<string, CalendarEvent[]>();
  const allDayByDate = new Map<string, CalendarEvent[]>();
  for (const date of dates) {
    eventsByDate.set(date, []);
    allDayByDate.set(date, []);
  }
  for (const ev of events) {
    const start = ev.date;
    const end = ev.endDate || ev.date;
    const isMultiOrAllDay = ev.allDay || start !== end;
    for (const date of dates) {
      if (date >= start && date <= end) {
        if (isMultiOrAllDay) allDayByDate.get(date)?.push(ev);
        else eventsByDate.get(date)?.push(ev);
      }
    }
  }

  const hasAllDay = dates.some((d) => (allDayByDate.get(d) || []).length > 0);

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-zinc-900">
      <div
        className="grid border-b border-zinc-100 text-center dark:border-zinc-800"
        style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${dates.length}, 1fr)` }}
      >
        <div />
        {dates.map((date) => (
          <div key={date} className="py-2.5">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}
            </div>
            <div
              className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                date === today
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-700 dark:text-zinc-200"
              }`}
            >
              {Number(date.slice(8, 10))}
            </div>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div
          className="grid border-b border-zinc-100 dark:border-zinc-800"
          style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${dates.length}, 1fr)` }}
        >
          <div className="py-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400">All day</div>
          {dates.map((date) => (
            <div key={date} className="flex flex-col gap-1 border-l border-zinc-100 p-1 dark:border-zinc-800">
              {(allDayByDate.get(date) || []).map((ev) => (
                <button
                  key={ev.occurrenceId}
                  onClick={() => onSelectEvent(ev)}
                  title={ev.title}
                  className={`flex min-h-[28px] items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-xs hover:opacity-80 ${
                    ev.completed ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={categoryDotStyle(ev.category, categories)} />
                  <span className="truncate">{ev.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${dates.length}, 1fr)` }}
        >
          <div>
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="relative -top-2 pr-2 text-right text-xs text-zinc-500 dark:text-zinc-400"
              >
                {h !== 0 && hourLabel(h)}
              </div>
            ))}
          </div>
          {dates.map((date) => (
            <div key={date} className="relative border-l border-zinc-100 dark:border-zinc-800">
              {HOURS.map((h) => (
                <button
                  key={h}
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => onSelectSlot(date, `${String(h).padStart(2, "0")}:00`)}
                  className="block w-full border-b border-zinc-50 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                />
              ))}
              {(eventsByDate.get(date) || []).map((ev) => {
                const startMin = timeToMinutes(ev.startTime);
                const endMin = Math.max(timeToMinutes(ev.endTime), startMin + MIN_EVENT_MINUTES);
                const top = (startMin / 60) * HOUR_HEIGHT;
                const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                return (
                  <button
                    key={ev.occurrenceId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(ev);
                    }}
                    style={{ top, height }}
                    className={`absolute left-0.5 right-0.5 overflow-hidden rounded-md px-2 py-1 text-left text-xs shadow-sm ${
                      ev.completed
                        ? "bg-zinc-50 text-zinc-400 line-through dark:bg-zinc-800/40"
                        : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={categoryDotStyle(ev.category, categories)} />
                      <span className="truncate font-medium">{ev.title}</span>
                      {(ev.priority === "high" || ev.priority === "urgent") && (
                        <span>{ev.priority === "urgent" ? "🔴" : "🟠"}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { dayLabel };
