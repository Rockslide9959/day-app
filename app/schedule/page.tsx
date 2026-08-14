"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { todayStr, formatDateLabel, addDaysToDateStr, formatTime12h, timeToMinutes } from "@/lib/dates";
import EventModal, { EventDraft } from "@/components/calendar/EventModal";
import { CalendarEvent } from "@/components/calendar/types";
import { CategoryDef, DEFAULT_CATEGORIES } from "@/lib/calendar/categories";
import { categoryEventStyle } from "@/components/calendar/categories";
import { isScheduleItemVisible } from "@/lib/calendar/visibility";
import { draftToPayload } from "@/lib/calendar/payload";

type Filter = "all" | "events" | "tasks";

export default function SchedulePage() {
  const [date, setDate] = useState(todayStr());
  const [items, setItems] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [modalState, setModalState] = useState<
    { mode: "view"; event: CalendarEvent } | { mode: "create" } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule?from=${date}&to=${date}`);
      setItems(await res.json());
    } catch {
      // leave whatever was already loaded in place
    }
    setLoading(false);
  }, [date]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Request failed");
      setCategories(await res.json());
    } catch {
      setCategories(DEFAULT_CATEGORIES);
    }
  }, []);

  const categoriesLoadedRef = useRef(false);
  useEffect(() => {
    load();
    if (!categoriesLoadedRef.current) {
      categoriesLoadedRef.current = true;
      loadCategories();
    }
  }, [load, loadCategories]);

  const visibleItems = useMemo(() => {
    return items
      .filter((i) => isScheduleItemVisible(i))
      .filter((i) => (filter === "all" ? true : filter === "events" ? i.itemType !== "task" : i.itemType === "task"))
      .sort((a, b) => {
        const aAllDay = a.allDay;
        const bAllDay = b.allDay;
        if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
        return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      });
  }, [items, filter]);

  async function handleSave(id: string | null, draft: EventDraft) {
    const payload = draftToPayload(draft);
    if (id) {
      const res = await fetch(`/api/schedule/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
    } else {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
    }
    setModalState(null);
    await load();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    setModalState(null);
    await load();
  }

  async function handleDuplicate(id: string) {
    const res = await fetch(`/api/schedule/${id}/duplicate`, { method: "POST" });
    if (!res.ok) throw new Error("Duplicate failed");
    setModalState(null);
    await load();
  }

  async function handleToggleComplete(event: CalendarEvent) {
    const body = event.isRecurringInstance
      ? { toggleCompletedDate: event.occurrenceDate }
      : { completed: !event.completed };
    const res = await fetch(`/api/schedule/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    setModalState(null);
    await load();
  }

  async function handleAddCategory(name: string, colorHex: string) {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, colorHex }),
    });
    await loadCategories();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-24">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Schedule
      </h1>

      <div className="mb-4 flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-zinc-900">
        <button
          onClick={() => setDate((d) => addDaysToDateStr(d, -1))}
          className="px-2 py-1 text-zinc-400"
          aria-label="Previous day"
        >
          ←
        </button>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {formatDateLabel(date)}
        </span>
        <button
          onClick={() => setDate((d) => addDaysToDateStr(d, 1))}
          className="px-2 py-1 text-zinc-400"
          aria-label="Next day"
        >
          →
        </button>
      </div>

      <div className="mb-4 flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
        {(["all", "events", "tasks"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-md py-1.5 font-medium capitalize ${
              filter === f
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-500"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : visibleItems.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
          Nothing scheduled for this day
        </div>
      ) : (
        <ul className="mb-6 space-y-2">
          {visibleItems.map((item) => {
            const isTask = item.itemType === "task";
            const timeLabel = isTask
              ? item.allDay
                ? "Due today"
                : `Due ${formatTime12h(item.startTime)}`
              : item.allDay
                ? "All day"
                : `${formatTime12h(item.startTime)}–${formatTime12h(item.endTime)}`;
            return (
              <li
                key={item.occurrenceId}
                className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900"
              >
                {isTask ? (
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggleComplete(item)}
                    aria-label={item.completed ? `Reopen task: ${item.title}` : `Mark task complete: ${item.title}`}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
                  />
                ) : (
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryEventStyle(item.category, categories).backgroundColor }}
                  />
                )}
                <button
                  onClick={() => setModalState({ mode: "view", event: item })}
                  className="min-w-0 flex-1 text-left"
                >
                  <p
                    className={`text-sm ${
                      item.completed ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {timeLabel}
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                  {item.notes && <p className="mt-0.5 truncate text-xs text-zinc-500">{item.notes}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => setModalState({ mode: "create" })}
        className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 dark:border-zinc-700"
      >
        + New
      </button>

      {modalState && (
        <EventModal
          event={modalState.mode === "view" ? modalState.event : null}
          createDefaults={modalState.mode === "create" ? { date } : null}
          categories={categories}
          existingEvents={items}
          onClose={() => setModalState(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onToggleComplete={handleToggleComplete}
          onAddCategory={handleAddCategory}
        />
      )}
    </main>
  );
}
