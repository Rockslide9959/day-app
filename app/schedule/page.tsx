"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { formatTime12h, timeToMinutes } from "@/lib/dates";
import { useSyncedDate, useTodayStr } from "@/lib/useTodayStr";
import EventModal, { EventDraft } from "@/components/calendar/EventModal";
import { CalendarEvent } from "@/components/calendar/types";
import { CategoryDef, DEFAULT_CATEGORIES } from "@/lib/calendar/categories";
import { categoryEventStyle } from "@/components/calendar/categories";
import { isScheduleItemVisible } from "@/lib/calendar/visibility";
import { draftToPayload } from "@/lib/calendar/payload";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useDataChanged } from "@/lib/useDataChanged";
import PageHeader from "@/components/ui/PageHeader";
import DateStepper from "@/components/ui/DateStepper";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import { PRIMARY_BUTTON, SECTION_LABEL, stagger } from "@/components/ui/styles";

type Filter = "all" | "events" | "tasks";

export default function SchedulePage() {
  const [date, setDate] = useSyncedDate();
  const today = useTodayStr();
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
  // Refetch when Quick Add changes something while this page is open.
  useDataChanged(load);

  const visibleItems = useMemo(() => {
    return items
      .filter((i) => isScheduleItemVisible(i))
      .filter((i) => !(i.itemType === "task" && i.completed))
      .filter((i) => (filter === "all" ? true : filter === "events" ? i.itemType !== "task" : i.itemType === "task"))
      .sort((a, b) => {
        const aAllDay = a.allDay;
        const bAllDay = b.allDay;
        if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
        return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      });
  }, [items, filter]);

  // Completed tasks live in their own section instead of visibleItems —
  // isScheduleItemVisible hides them once their due moment passes, which
  // otherwise makes a finished task vanish with no way to see it was done.
  const completedTasks = useMemo(() => {
    if (filter === "events") return [];
    return items
      .filter((i) => i.itemType === "task" && i.completed)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
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
    <main className="phase-in mx-auto max-w-2xl px-4 pt-8 pb-24">
      <PageHeader
        eyebrow={date === today ? "Today" : date < today ? "Looking back" : "Coming up"}
        title="Schedule"
        subtitle={
          loading
            ? "Loading your day…"
            : visibleItems.length === 0
              ? "A free day so far."
              : `${visibleItems.length} ${visibleItems.length === 1 ? "item" : "items"} on the agenda`
        }
      />

      <DateStepper date={date} today={today} onChange={setDate} className="mb-3" />

      <SegmentedControl
        label="Filter"
        options={[
          { value: "all", label: "All" },
          { value: "events", label: "Events" },
          { value: "tasks", label: "Tasks" },
        ]}
        value={filter}
        onChange={setFilter}
        className="mb-5"
      />

      {loading ? (
        <LoadingSpinner />
      ) : visibleItems.length === 0 ? (
        <EmptyState emoji="🌤️" title="Nothing scheduled for this day" hint="Tap + New to plan something." className="mb-5" />
      ) : (
        <ul className="mb-5 space-y-2">
          {visibleItems.map((item, i) => {
            const isTask = item.itemType === "task";
            const color = categoryEventStyle(item.category, categories).backgroundColor;
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
                style={stagger(i)}
                className="item-in lift relative flex items-stretch gap-3 overflow-hidden rounded-2xl bg-white py-3 pl-4 pr-4 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border"
              >
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
                <div className="flex w-16 shrink-0 flex-col justify-center text-right">
                  <span className="text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
                    {item.allDay ? "All day" : formatTime12h(item.startTime)}
                  </span>
                  {!item.allDay && !isTask && (
                    <span className="text-[10px] tabular-nums text-zinc-400 crimson:text-crimson-text-muted">{formatTime12h(item.endTime)}</span>
                  )}
                </div>
                <span aria-hidden="true" className="w-px shrink-0 bg-zinc-100 dark:bg-zinc-800 crimson:bg-crimson-border" />
                {isTask ? (
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggleComplete(item)}
                    aria-label={item.completed ? `Reopen task: ${item.title}` : `Mark task complete: ${item.title}`}
                    className="mt-0.5 h-4 w-4 shrink-0 self-center rounded border-zinc-300 dark:border-zinc-600 crimson:border-crimson-border"
                  />
                ) : null}
                <button
                  onClick={() => setModalState({ mode: "view", event: item })}
                  className="min-w-0 flex-1 text-left active:scale-100"
                >
                  <p
                    className={`truncate text-sm font-medium ${
                      item.completed ? "text-zinc-400 line-through crimson:text-crimson-text-muted" : "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                    {isTask && (
                      <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide dark:bg-zinc-800 crimson:bg-crimson-raised">
                        Task
                      </span>
                    )}
                    <span className="truncate">
                      {isTask ? timeLabel : item.category || timeLabel}
                      {isTask && item.category ? ` · ${item.category}` : ""}
                    </span>
                  </p>
                  {item.notes && <p className="mt-0.5 truncate text-xs text-zinc-400 crimson:text-crimson-text-muted">{item.notes}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => setModalState({ mode: "create" })}
        className={`${PRIMARY_BUTTON} flex w-full items-center justify-center gap-2 py-3.5 text-sm`}
      >
        <span className="text-lg leading-none">＋</span> New event or task
      </button>

      {completedTasks.length > 0 && (
        <div className="mt-7">
          <h2 className={`mb-2.5 px-1 ${SECTION_LABEL}`}>Completed · {completedTasks.length}</h2>
          <ul className="space-y-2">
            {completedTasks.map((item, i) => (
              <li
                key={item.occurrenceId}
                style={stagger(i)}
                className="item-in flex items-start gap-3 rounded-2xl bg-white/60 px-4 py-3 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900/60 dark:ring-white/5 crimson:bg-crimson-surface/60 crimson:ring-crimson-border"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => handleToggleComplete(item)}
                  aria-label={`Reopen task: ${item.title}`}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600 crimson:border-crimson-border"
                />
                <button
                  onClick={() => setModalState({ mode: "view", event: item })}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm text-zinc-400 line-through crimson:text-crimson-text-muted">{item.title}</p>
                  <p className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                    {item.allDay ? "Due today" : `Due ${formatTime12h(item.startTime)}`}
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
