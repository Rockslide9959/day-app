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
import { useSyncedDate } from "@/lib/useTodayStr";
import MonthView from "@/components/calendar/MonthView";
import WeekView from "@/components/calendar/WeekView";
import DayView from "@/components/calendar/DayView";
import EventModal, { EventDraft } from "@/components/calendar/EventModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import DayAgendaModal from "@/components/calendar/DayAgendaModal";
import CategoryFilter from "@/components/calendar/CategoryFilter";
import CalendarLegend from "@/components/calendar/CalendarLegend";
import FreeTimeFinder from "@/components/calendar/FreeTimeFinder";
import { filterVisibleEvents, normalizeCachedEvent } from "@/lib/calendarFilter";
import { CalendarEvent, ViewMode } from "@/components/calendar/types";
import { CategoryDef, DEFAULT_CATEGORIES } from "@/lib/calendar/categories";
import { isScheduleItemVisible } from "@/lib/calendar/visibility";
import { draftToPayload } from "@/lib/calendar/payload";
import { useDataChanged } from "@/lib/useDataChanged";
import PageHeader from "@/components/ui/PageHeader";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import { CARD, GHOST_BUTTON, INPUT, PRIMARY_BUTTON, stagger } from "@/components/ui/styles";

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
  const [anchorDate, setAnchorDate] = useSyncedDate();
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

    // Deep link: /calendar?date=YYYY-MM-DD opens the day view for that date
    // (rather than a specific item's modal, which would need a larger
    // refactor of how modalState gets seeded).
    const dateParam = new URLSearchParams(window.location.search).get("date");
    if (dateParam) {
      setAnchorDate(dateParam);
      setViewMode("day");
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
  // Refetch when Quick Add changes something while this page is open.
  useDataChanged(load);

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
    <main className="phase-in mx-auto max-w-3xl px-4 pb-24 pt-8">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title="Calendar"
        actions={
          <>
            <button
              onClick={() => setModalState({ mode: "create", date: anchorDate })}
              className={`${PRIMARY_BUTTON} hidden px-5 py-2.5 text-sm sm:block`}
            >
              ＋ New
            </button>
            <button onClick={() => setShowFreeTime(true)} className={`${GHOST_BUTTON} px-4 py-2.5 text-sm`}>
              🕊️ Find free time
            </button>
          </>
        }
      />

      <div className="relative mb-3">
        <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400 crimson:text-crimson-text-muted">
          🔍
        </span>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search events and tasks…"
          className={`${INPUT} w-full pl-11`}
        />
      </div>

      <CategoryFilter categories={categories} hidden={hidden} onToggle={toggleCategory} />
      <CalendarLegend />

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
          <div className={`${CARD} mb-4 flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="flex min-w-0 items-center justify-between gap-0.5 sm:justify-start">
              <button
                onClick={goPrev}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 crimson:text-crimson-text-muted crimson:hover:bg-crimson-raised"
                aria-label="Previous"
              >
                ←
              </button>
              <button
                key={title}
                onClick={goToday}
                title="Jump to today"
                className="swap-in-next truncate rounded-full px-2.5 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800 crimson:text-crimson-text crimson:hover:bg-crimson-raised"
              >
                {title}
              </button>
              <button
                onClick={goNext}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 crimson:text-crimson-text-muted crimson:hover:bg-crimson-raised"
                aria-label="Next"
              >
                →
              </button>
            </div>
            <SegmentedControl
              label="View"
              options={(["month", "week", "day"] as ViewMode[]).map((mode) => ({ value: mode, label: mode }))}
              value={viewMode}
              onChange={setViewMode}
              className="w-full shrink-0 sm:w-48"
            />
          </div>

          {error && (
            <div
              className={`nudge mb-4 rounded-2xl px-4 py-3 text-sm ${
                usingCache
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 crimson:bg-amber-950/40 crimson:text-amber-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight"
              }`}
            >
              {error}
            </div>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : (
            <div key={viewMode} className="item-in">
            {viewMode === "month" ? (
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
            </div>
          )}
        </>
      )}

      {/* Mobile quick-add FAB */}
      <button
        onClick={() => setModalState({ mode: "create", date: anchorDate })}
        aria-label="New item"
        className={`${PRIMARY_BUTTON} fab-in fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center text-2xl shadow-xl sm:hidden`}
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
    return <EmptyState emoji="🔎" title="No matching events" />;
  }
  return (
    <ul className="space-y-2">
      {results.map((ev, i) => (
        <li key={ev.id} className="item-in" style={stagger(i)}>
          <button
            onClick={() => onSelect(ev)}
            className={`${CARD} lift flex w-full items-center justify-between gap-3 px-4 py-3 text-left`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
                {ev.itemType === "task" && <span className="mr-1">{ev.completed ? "☑" : "☐"}</span>}
                {ev.title}
              </p>
              <p className="text-xs text-zinc-400 crimson:text-crimson-text-muted">
                {ev.itemType === "task" ? `Due ${ev.date}` : ev.date}
                {ev.category ? ` · ${ev.category}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-zinc-300 crimson:text-crimson-text-muted">→</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
