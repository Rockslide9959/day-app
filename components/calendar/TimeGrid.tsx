"use client";

import { useEffect, useRef, useState } from "react";
import { dayLabel, formatTime12h, timeToMinutes, todayStr } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { categoryEventStyle } from "./categories";
import { CategoryDef } from "@/lib/calendar/categories";

const HOUR_HEIGHT = 64; // px per hour
const GUTTER_WIDTH = 56; // px, hour-label column
const MIN_EVENT_MINUTES = 30; // minimum visual block height, for tap targets
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(h: number) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// Lays out same-day events into side-by-side columns so overlapping events
// don't render on top of each other and become unreadable.
function layoutDayEvents(dayEvents: CalendarEvent[]): Map<string, { col: number; cols: number }> {
  const sorted = [...dayEvents].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const result = new Map<string, { col: number; cols: number }>();

  let active: { id: string; col: number; endMin: number }[] = [];
  let cluster: { id: string; col: number }[] = [];
  let clusterMaxCol = 0;

  function flushCluster() {
    if (cluster.length === 0) return;
    const cols = clusterMaxCol + 1;
    for (const c of cluster) result.set(c.id, { col: c.col, cols });
    cluster = [];
    clusterMaxCol = 0;
  }

  for (const ev of sorted) {
    const startMin = timeToMinutes(ev.startTime);
    const endMin = Math.max(timeToMinutes(ev.endTime), startMin + MIN_EVENT_MINUTES);
    active = active.filter((a) => a.endMin > startMin);
    if (active.length === 0) flushCluster();
    const usedCols = new Set(active.map((a) => a.col));
    let col = 0;
    while (usedCols.has(col)) col++;
    active.push({ id: ev.occurrenceId, col, endMin });
    cluster.push({ id: ev.occurrenceId, col });
    clusterMaxCol = Math.max(clusterMaxCol, col);
  }
  flushCluster();
  return result;
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
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT });
  }, []);

  useEffect(() => {
    setNow(nowMinutes());
    const id = setInterval(() => setNow(nowMinutes()), 60000);
    return () => clearInterval(id);
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
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div
        className="grid border-b border-zinc-200 text-center dark:border-zinc-800"
        style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${dates.length}, 1fr)` }}
      >
        <div />
        {dates.map((date) => (
          <div key={date} className="py-2.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}
            </div>
            <div
              className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                date === today ? "bg-red-500 text-white" : "text-zinc-700 dark:text-zinc-200"
              }`}
            >
              {Number(date.slice(8, 10))}
            </div>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div
          className="grid border-b border-zinc-200 dark:border-zinc-800"
          style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${dates.length}, 1fr)` }}
        >
          <div className="flex items-start justify-end py-1.5 pr-2 text-right text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            All day
          </div>
          {dates.map((date) => (
            <div key={date} className="flex flex-col gap-1 border-l border-zinc-100 p-1 dark:border-zinc-800">
              {(allDayByDate.get(date) || []).map((ev) => (
                <button
                  key={ev.occurrenceId}
                  onClick={() => onSelectEvent(ev)}
                  title={ev.title}
                  style={ev.completed ? undefined : categoryEventStyle(ev.category, categories)}
                  className={`flex min-h-[28px] items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-xs font-medium hover:opacity-90 ${
                    ev.completed
                      ? "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500"
                      : ""
                  }`}
                >
                  {ev.itemType === "task" && <span className="shrink-0">{ev.completed ? "☑" : "☐"}</span>}
                  <span className="truncate">{ev.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${dates.length}, 1fr)` }}
        >
          <div>
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="relative -top-2 pr-2 text-right text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
              >
                {h !== 0 && hourLabel(h)}
              </div>
            ))}
          </div>
          {dates.map((date) => {
            const dayItems = eventsByDate.get(date) || [];
            const dayTimedEvents = dayItems.filter((ev) => ev.itemType !== "task");
            const dayTimedTasks = dayItems.filter((ev) => ev.itemType === "task");
            const layout = layoutDayEvents(dayTimedEvents);
            return (
              <div key={date} className="relative border-l border-zinc-100 dark:border-zinc-800">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() => onSelectSlot(date, `${String(h).padStart(2, "0")}:00`)}
                    className="block w-full border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                  />
                ))}
                {date === today && now !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: (now / 60) * HOUR_HEIGHT }}
                  >
                    <span className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                  </div>
                )}
                {dayTimedEvents.map((ev) => {
                  const startMin = timeToMinutes(ev.startTime);
                  const endMin = Math.max(timeToMinutes(ev.endTime), startMin + MIN_EVENT_MINUTES);
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                  const { col, cols } = layout.get(ev.occurrenceId) || { col: 0, cols: 1 };
                  const widthPct = 100 / cols;
                  return (
                    <button
                      key={ev.occurrenceId}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      style={{
                        top,
                        height,
                        left: `calc(${col * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        ...(ev.completed ? {} : categoryEventStyle(ev.category, categories)),
                      }}
                      className={`absolute z-[1] overflow-hidden rounded-md px-2 py-1 text-left text-xs shadow-sm ${
                        ev.completed
                          ? "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500"
                          : "hover:opacity-90"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{ev.title}</span>
                        {(ev.priority === "high" || ev.priority === "urgent") && (
                          <span>{ev.priority === "urgent" ? "🔴" : "🟠"}</span>
                        )}
                      </span>
                      {height >= 36 && (
                        <span className="block truncate text-[11px] opacity-90">
                          {formatTime12h(ev.startTime)}–{formatTime12h(ev.endTime)}
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* Tasks with a due time: a compact marker at the due moment,
                    not a duration block — height comes from content, never
                    from start/end, so it never implies occupied time. */}
                {dayTimedTasks.map((task) => {
                  const top = (timeToMinutes(task.startTime) / 60) * HOUR_HEIGHT;
                  const dotColor = categoryEventStyle(task.category, categories).backgroundColor as string;
                  return (
                    <button
                      key={task.occurrenceId}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(task);
                      }}
                      style={{ top, borderColor: task.completed ? undefined : dotColor }}
                      className={`absolute left-1 right-1 z-[2] flex items-center gap-1.5 truncate rounded-md border border-dashed bg-white/95 px-1.5 py-0.5 text-left text-[11px] font-medium shadow-sm dark:bg-zinc-900/95 ${
                        task.completed
                          ? "border-zinc-200 text-zinc-400 line-through dark:border-zinc-700"
                          : "text-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      <span className="shrink-0">{task.completed ? "☑" : "☐"}</span>
                      <span className="truncate">{task.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { dayLabel };
