"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  dayLabel,
  getMonthGrid,
  getWeekDates,
  monthLabel,
  todayStr,
  weekRangeLabel,
} from "@/lib/dates";
import MonthView from "@/components/calendar/MonthView";
import WeekView from "@/components/calendar/WeekView";
import DayView from "@/components/calendar/DayView";
import EventModal, { EventDraft } from "@/components/calendar/EventModal";
import DayAgendaModal from "@/components/calendar/DayAgendaModal";
import CategoryFilter from "@/components/calendar/CategoryFilter";
import FreeTimeFinder from "@/components/calendar/FreeTimeFinder";
import { filterVisibleEvents, normalizeCachedEvent } from "@/lib/calendarFilter";
import { CalendarEvent, ViewMode } from "@/components/calendar/types";
import { CategoryDef, DEFAULT_CATEGORIES } from "@/lib/calendar/categories";
import { isScheduleItemVisible } from "@/lib/calendar/visibility";
import { draftToPayload } from "@/lib/calendar/payload";

const HIDDEN_CATEGORIES_KEY = "day:calendar:hiddenCategories";
const VIEW_MODE_KEY = "day:calendar:viewMode";
const CACHE_PREFIX = "day:calendar:cache:";

function readEventCache(from: string, to: string): CalendarEvent[] | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${from}_${to}`);
    if (!raw) return null;
    const events = JSON.parse(raw).events;
    return Array.isArray(events) ? events.map(normalizeCachedEvent) : null;
  } catch {
    return null;
  }
}

function writeEventCache(from: string, to: string, events: CalendarEvent[]) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${from}_${to}`, JSON.stringify({ events, cachedAt: Date.now() }));
  } catch {
    // Storage full/unavailable — caching is a nice-to-have, not required.
  }
}

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(todayStr());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingCache, setUsingCache] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CalendarEvent[] | null>(null);
  const [showFreeTime, setShowFreeTime] = useState(false);
  const [journalDates, setJournalDates] = useState<Set<string>>(new Set());
  const [modalState, setModalState] = useState<
    | { mode: "view"; event: CalendarEvent }
    | { mode: "create"; date: string; startTime?: string }
    | { mode: "day"; date: string }
    | null
  >(null);

  useEffect(() => {
    const savedView = localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
    if (savedView === "month" || savedView === "week" || savedView === "day") {
      setViewMode(savedView);
    }
    try {
      const savedHidden = JSON.parse(localStorage.getItem(HIDDEN_CATEGORIES_KEY) || "[]");
      setHidden(new Set(savedHidden));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const { from, to } = useMemo(() => {
    if (viewMode === "month") {
      const weeks = getMonthGrid(anchorDate);
      return { from: weeks[0][0], to: weeks[5][6] };
    }
    if (viewMode === "week") {
      const dates = getWeekDates(anchorDate);
      return { from: dates[0], to: dates[6] };
    }
    return { from: anchorDate, to: anchorDate };
  }, [viewMode, anchorDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setUsingCache(false);
    try {
      const res = await fetch(`/api/schedule?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setEvents(data);
      writeEventCache(from, to, data);
    } catch {
      const cached = readEventCache(from, to);
      if (cached) {
        setEvents(cached);
        setUsingCache(true);
        setError("You're offline — showing your last loaded view of this calendar.");
      } else {
        setError("Couldn't load your calendar. Check your connection and try again.");
      }
    }
    setLoading(false);
  }, [from, to]);

  const fallbackCategories: CategoryDef[] = DEFAULT_CATEGORIES;

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Request failed");
      setCategories(await res.json());
    } catch {
      // Custom categories need the API, but the built-in defaults still
      // work offline/DB-down so the picker is never empty.
      setCategories(fallbackCategories);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Month-view journal indicator metadata — one request per visible
  // range, independent of the main calendar load so a failure here never
  // delays or breaks the core event/task display.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebook/dates?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((dates: string[]) => {
        if (!cancelled) setJournalDates(new Set(dates));
      })
      .catch(() => {
        // Leave whatever indicators were already loaded in place.
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/schedule/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(await res.json());
      } catch {
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  function toggleCategory(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      localStorage.setItem(HIDDEN_CATEGORIES_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const timeVisibleEvents = useMemo(() => events.filter((e) => isScheduleItemVisible(e)), [events]);
  const visibleEvents = filterVisibleEvents(timeVisibleEvents, hidden);

  function goToday() {
    setAnchorDate(todayStr());
  }
  function goPrev() {
    if (viewMode === "month") setAnchorDate((d) => addMonthsToDateStr(d, -1));
    else if (viewMode === "week") setAnchorDate((d) => addDaysToDateStr(d, -7));
    else setAnchorDate((d) => addDaysToDateStr(d, -1));
  }
  function goNext() {
    if (viewMode === "month") setAnchorDate((d) => addMonthsToDateStr(d, 1));
    else if (viewMode === "week") setAnchorDate((d) => addDaysToDateStr(d, 7));
    else setAnchorDate((d) => addDaysToDateStr(d, 1));
  }

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

  const title =
    viewMode === "month"
      ? monthLabel(anchorDate)
      : viewMode === "week"
        ? weekRangeLabel(anchorDate)
        : dayLabel(anchorDate);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Calendar</h1>
        <div className="hidden items-center gap-2 sm:flex">
          <button
            onClick={() => setShowFreeTime(true)}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-700"
          >
            Find Free Time
          </button>
          <button
            onClick={() => setModalState({ mode: "create", date: anchorDate })}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            + New
          </button>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search events and tasks…"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <CategoryFilter categories={categories} hidden={hidden} onToggle={toggleCategory} />

      {searchResults ? (
        <SearchResults
          results={searchResults}
          onSelect={(event) => {
            setSearchQuery("");
            setModalState({ mode: "view", event });
          }}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-white px-2 py-2 shadow-sm dark:bg-zinc-900">
            <div className="flex min-w-0 items-center gap-0.5">
              <button
                onClick={goPrev}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Previous"
              >
                ←
              </button>
              <button
                onClick={goToday}
                className="truncate rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                {title}
              </button>
              <button
                onClick={goNext}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Next"
              >
                →
              </button>
            </div>
            <div className="flex shrink-0 rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
              {(["month", "week", "day"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-2.5 py-1.5 font-medium capitalize ${
                    viewMode === mode
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-500"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div
              className={`mb-4 rounded-xl px-4 py-3 text-sm ${
                usingCache
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              }`}
            >
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : viewMode === "month" ? (
            <MonthView
              anchorDate={anchorDate}
              events={visibleEvents}
              categories={categories}
              journalDates={journalDates}
              onSelectDate={(date) => setModalState({ mode: "day", date })}
              onSelectEvent={(event) => setModalState({ mode: "view", event })}
            />
          ) : viewMode === "week" ? (
            <WeekView
              anchorDate={anchorDate}
              events={visibleEvents}
              categories={categories}
              onSelectSlot={(date, startTime) => setModalState({ mode: "create", date, startTime })}
              onSelectEvent={(event) => setModalState({ mode: "view", event })}
            />
          ) : (
            <DayView
              anchorDate={anchorDate}
              events={visibleEvents}
              categories={categories}
              onSelectSlot={(date, startTime) => setModalState({ mode: "create", date, startTime })}
              onSelectEvent={(event) => setModalState({ mode: "view", event })}
            />
          )}
        </>
      )}

      {/* Mobile quick-add FAB */}
      <button
        onClick={() => setModalState({ mode: "create", date: anchorDate })}
        aria-label="New item"
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-2xl text-white shadow-lg sm:hidden dark:bg-zinc-50 dark:text-zinc-900"
      >
        +
      </button>

      {modalState && (modalState.mode === "view" || modalState.mode === "create") && (
        <EventModal
          event={modalState.mode === "view" ? modalState.event : null}
          createDefaults={
            modalState.mode === "create"
              ? { date: modalState.date, startTime: modalState.startTime }
              : null
          }
          categories={categories}
          existingEvents={events}
          offline={!isOnline}
          onClose={() => setModalState(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onToggleComplete={handleToggleComplete}
          onAddCategory={handleAddCategory}
        />
      )}

      {modalState && modalState.mode === "day" && (
        <DayAgendaModal
          date={modalState.date}
          events={visibleEvents}
          categories={categories}
          onClose={() => setModalState(null)}
          onSelectEvent={(event) => setModalState({ mode: "view", event })}
          onAddEvent={(date) => setModalState({ mode: "create", date })}
        />
      )}

      {showFreeTime && (
        <FreeTimeFinder events={events} onClose={() => setShowFreeTime(false)} />
      )}
    </main>
  );
}

function SearchResults({
  results,
  onSelect,
}: {
  results: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
        No matching events
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {results.map((ev) => (
        <li key={ev.id}>
          <button
            onClick={() => onSelect(ev)}
            className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left shadow-sm dark:bg-zinc-900"
          >
            <div>
              <p className="text-sm text-zinc-900 dark:text-zinc-50">
                {ev.itemType === "task" && <span className="mr-1">{ev.completed ? "☑" : "☐"}</span>}
                {ev.title}
              </p>
              <p className="text-xs text-zinc-400">
                {ev.itemType === "task" ? `Due ${ev.date}` : ev.date}
                {ev.category ? ` · ${ev.category}` : ""}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
