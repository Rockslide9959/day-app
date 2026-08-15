"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarEvent } from "./types";
import { categoryChipStyle, priorityMeta } from "./categories";
import { formatDateLabel, formatTime12h } from "@/lib/dates";
import { CategoryDef, isDeadlineCategory } from "@/lib/calendar/categories";
import { findConflicts } from "@/lib/calendar/conflicts";
import { Timer } from "@/components/timers/types";
import TimerCard from "@/components/timers/TimerCard";
import NewTimerForm from "@/components/timers/NewTimerForm";

const REMINDER_OPTIONS = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At time of event" },
  { value: "5", label: "5 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "custom", label: "Custom days" },
];

// Mirrors REMINDER_OPTIONS' offsets with task/event-specific phrasing, e.g.
// "at due time" / "1 hour before start" / "30 minutes before due".
function reminderOffsetLabel(minutes: number, isTask: boolean): string {
  const noun = isTask ? "due" : "start";
  if (minutes === 0) return `at ${isTask ? "due time" : "start time"}`;
  if (minutes === 60) return `1 hour before ${noun}`;
  if (minutes === 1440) return `1 day before ${noun}`;
  return `${minutes} minutes before ${noun}`;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const ITEM_TYPES = ["event", "task"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

type EventShare = { id: string; token: string; createdAt: string };

export type EventDraft = {
  itemType: ItemType;
  title: string;
  notes: string;
  date: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  // Task-only: whether a due time is set. When false, the task is saved
  // allDay with the standard "00:00"/"23:59" internal times.
  hasDueTime: boolean;
  location: string;
  category: string;
  priority: string;
  reminderMinutesBefore: string;
  recurrence: string;
  recurrenceDays: number[];
  recurrenceEndDate: string;
  subject: string;
  estimatedHours: string;
};

function draftFromEvent(event: CalendarEvent): EventDraft {
  const itemType: ItemType = event.itemType === "task" ? "task" : "event";
  return {
    itemType,
    title: event.title,
    notes: event.notes || "",
    date: event.date,
    startTime: event.startTime,
    endDate: event.endDate || event.date,
    endTime: event.endTime,
    allDay: event.allDay,
    hasDueTime: itemType === "task" ? !event.allDay : false,
    location: event.location || "",
    category: event.category || "",
    priority: event.priority || "normal",
    reminderMinutesBefore:
      event.reminderMinutesBefore == null ? "" : String(event.reminderMinutesBefore),
    recurrence: event.recurrence || "none",
    recurrenceDays: (event.recurrenceDays || "").split(",").filter(Boolean).map(Number),
    recurrenceEndDate: event.recurrenceEndDate || "",
    subject: event.subject || "",
    estimatedHours: event.estimatedHours == null ? "" : String(event.estimatedHours),
  };
}

// Used both for the default new-event end time and when converting a task
// (a single instant) into an event (a range) — picks a plausible 1-hour
// block starting at the given time rather than leaving start === end.
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const endHour = (h + 1) % 24;
  return `${String(endHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function draftFromDefaults(defaults: { date: string; startTime?: string }): EventDraft {
  const startTime = defaults.startTime || "09:00";
  const endTime = addOneHour(startTime);
  return {
    itemType: "event",
    title: "",
    notes: "",
    date: defaults.date,
    startTime,
    endDate: defaults.date,
    endTime,
    allDay: false,
    hasDueTime: false,
    location: "",
    category: "",
    priority: "normal",
    reminderMinutesBefore: "",
    recurrence: "none",
    recurrenceDays: [],
    recurrenceEndDate: "",
    subject: "",
    estimatedHours: "",
  };
}

export default function EventModal({
  event,
  createDefaults,
  categories,
  existingEvents,
  prefill,
  offline = false,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onToggleComplete,
  onAddCategory,
}: {
  event: CalendarEvent | null;
  createDefaults: { date: string; startTime?: string } | null;
  categories: CategoryDef[];
  // Everything currently loaded, for conflict checking (independent of
  // category filters, which shouldn't hide a real scheduling clash).
  existingEvents: CalendarEvent[];
  prefill?: Partial<EventDraft>;
  offline?: boolean;
  onClose: () => void;
  onSave: (id: string | null, draft: EventDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onToggleComplete: (event: CalendarEvent) => Promise<void>;
  onAddCategory: (name: string, colorHex: string) => Promise<void>;
}) {
  const isExisting = Boolean(event);
  const [editing, setEditing] = useState(!isExisting);
  const [draft, setDraft] = useState<EventDraft>(() =>
    event
      ? draftFromEvent(event)
      : { ...draftFromDefaults(createDefaults || { date: "" }), ...prefill }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<CalendarEvent[] | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#3b82f6");

  useEffect(() => {
    setDraft(
      event
        ? draftFromEvent(event)
        : { ...draftFromDefaults(createDefaults || { date: "" }), ...prefill }
    );
    setEditing(!event);
    setError("");
    setConflicts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, createDefaults]);

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleRecurrenceDay(day: number) {
    setDraft((d) => ({
      ...d,
      recurrenceDays: d.recurrenceDays.includes(day)
        ? d.recurrenceDays.filter((x) => x !== day)
        : [...d.recurrenceDays, day].sort(),
    }));
  }

  const isTask = draft.itemType === "task";
  // A task is always single-day — converting a multi-day event would
  // silently drop its date range, so that conversion is blocked rather
  // than done lossily.
  const isMultiDayEvent = draft.itemType === "event" && draft.endDate !== draft.date;

  // Switching type re-derives the fields the other type needs rather than
  // leaving stale values: an event's start date/time become the task's due
  // date/time (and vice versa, defaulting a plausible 1-hour block).
  // Completion state and recurrence are shared fields already compatible
  // with both types, so they carry over untouched.
  function selectItemType(next: ItemType) {
    if (next === draft.itemType) return;
    setDraft((d) => {
      if (next === "task") {
        return { ...d, itemType: "task", hasDueTime: !d.allDay };
      }
      return {
        ...d,
        itemType: "event",
        allDay: !d.hasDueTime,
        endDate: d.date,
        endTime: d.hasDueTime ? addOneHour(d.startTime) : d.endTime,
      };
    });
  }

  // A task's due date/time is a deadline, not a reservation — findConflicts
  // already returns [] whenever the candidate (or a compared event) is a
  // task, so this naturally never flags a conflict for task drafts.
  const detectedConflicts = useMemo(() => {
    return findConflicts(
      {
        id: event?.id,
        itemType: draft.itemType,
        date: draft.date,
        endDate: draft.endDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        allDay: draft.allDay,
      },
      existingEvents
    );
  }, [draft.itemType, draft.date, draft.endDate, draft.startTime, draft.endTime, draft.allDay, event?.id, existingEvents]);

  async function doSave() {
    setSaving(true);
    setError("");
    try {
      await onSave(event?.id ?? null, draft);
    } catch {
      setError(`Couldn't save this ${isTask ? "task" : "event"}. Try again.`);
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError(isTask ? "Task title is required" : "Title is required");
      return;
    }
    if (!isTask && draft.endDate < draft.date) {
      setError("End date can't be before start date");
      return;
    }
    if (detectedConflicts.length > 0) {
      setConflicts(detectedConflicts);
      return;
    }
    await doSave();
  }

  async function handleDelete() {
    if (!event) return;
    setSaving(true);
    try {
      await onDelete(event.id);
    } catch {
      setError(`Couldn't delete this ${isTask ? "task" : "event"}. Try again.`);
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!event) return;
    setSaving(true);
    try {
      await onDuplicate(event.id);
    } catch {
      setError(`Couldn't duplicate this ${isTask ? "task" : "event"}. Try again.`);
    }
    setSaving(false);
  }

  async function submitNewCategory() {
    if (!newCategoryName.trim()) return;
    await onAddCategory(newCategoryName.trim(), newCategoryColor);
    set("category", newCategoryName.trim());
    setAddingCategory(false);
    setNewCategoryName("");
  }

  const showStudyFields = isDeadlineCategory(draft.category);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg sm:max-w-md sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {conflicts ? (
          <ConflictPanel
            conflicts={conflicts}
            onCancel={() => setConflicts(null)}
            onChangeTime={() => setConflicts(null)}
            onSaveAnyway={async () => {
              setConflicts(null);
              await doSave();
            }}
            saving={saving}
          />
        ) : !editing && event ? (
          <EventDetails
            event={event}
            categories={categories}
            onClose={onClose}
            onEdit={() => setEditing(true)}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onToggleComplete={() => onToggleComplete(event)}
            saving={saving}
            offline={offline}
            error={error}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {isExisting ? (isTask ? "Edit task" : "Edit event") : isTask ? "New task" : "New event"}
              </h2>
              <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <div>
              <div className="flex w-full rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
                {ITEM_TYPES.map((t) => {
                  const blocked = t === "task" && isMultiDayEvent;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={blocked}
                      onClick={() => selectItemType(t)}
                      className={`flex-1 rounded-md py-1.5 font-medium capitalize disabled:cursor-not-allowed disabled:opacity-60 ${
                        draft.itemType === t
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                          : "text-zinc-500"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              {isMultiDayEvent && (
                <p className="mt-1 text-[11px] text-zinc-400">
                  Shorten this to a single day (matching start/end date) to convert it to a task.
                </p>
              )}
            </div>

            {isExisting && event?.isRecurringInstance && (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                This is a recurring {isTask ? "task" : "event"} — changes apply to the whole series.
              </p>
            )}

            <input
              autoFocus
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={isTask ? "Task title" : "Event title"}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
            />

            {isTask ? (
              <>
                <div className="flex gap-3">
                  <label className="flex-1 text-xs text-zinc-500">
                    Due date
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => set("date", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </label>
                  {draft.hasDueTime && (
                    <label className="flex-1 text-xs text-zinc-500">
                      Due time
                      <input
                        type="time"
                        value={draft.startTime}
                        onChange={(e) => set("startTime", e.target.value)}
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </label>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={draft.hasDueTime}
                    onChange={(e) => set("hasDueTime", e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Set a due time
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={draft.allDay}
                    onChange={(e) => set("allDay", e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  All-day
                </label>

                <div className="flex gap-3">
                  <label className="flex-1 text-xs text-zinc-500">
                    Start date
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => set("date", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </label>
                  {!draft.allDay && (
                    <label className="flex-1 text-xs text-zinc-500">
                      Start time
                      <input
                        type="time"
                        value={draft.startTime}
                        onChange={(e) => set("startTime", e.target.value)}
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </label>
                  )}
                </div>

                <div className="flex gap-3">
                  <label className="flex-1 text-xs text-zinc-500">
                    End date
                    <input
                      type="date"
                      value={draft.endDate}
                      onChange={(e) => set("endDate", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </label>
                  {!draft.allDay && (
                    <label className="flex-1 text-xs text-zinc-500">
                      End time
                      <input
                        type="time"
                        value={draft.endTime}
                        onChange={(e) => set("endTime", e.target.value)}
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </label>
                  )}
                </div>

                <input
                  value={draft.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Location (optional)"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </>
            )}

            <textarea
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Description / notes (optional)"
              rows={3}
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
            />

            <div className="flex gap-3">
              <label className="flex-1 text-xs text-zinc-500">
                Category
                {addingCategory ? (
                  <div className="mt-1 flex gap-1.5">
                    <input
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Name"
                      className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <input
                      type="color"
                      value={newCategoryColor}
                      onChange={(e) => setNewCategoryColor(e.target.value)}
                      className="h-9 w-9 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={submitNewCategory}
                      className="shrink-0 rounded-xl bg-zinc-900 px-2 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <select
                    value={draft.category}
                    onChange={(e) => {
                      if (e.target.value === "__add__") setAddingCategory(true);
                      else set("category", e.target.value);
                    }}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    <option value="__add__">+ Add custom…</option>
                  </select>
                )}
              </label>
              <label className="flex-1 text-xs text-zinc-500">
                Priority
                <select
                  value={draft.priority}
                  onChange={(e) => set("priority", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {priorityMeta(p).label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {showStudyFields && (
              <div className="flex gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <label className="flex-1 text-xs text-zinc-500">
                  Subject / module
                  <input
                    value={draft.subject}
                    onChange={(e) => set("subject", e.target.value)}
                    placeholder="e.g. PROG7311"
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label className="w-28 text-xs text-zinc-500">
                  Est. hours
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.estimatedHours}
                    onChange={(e) => set("estimatedHours", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>
            )}

            <label className="block text-xs text-zinc-500">
              Reminder
              <select
                value={draft.reminderMinutesBefore}
                onChange={(e) => set("reminderMinutesBefore", e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                {REMINDER_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-zinc-400">
                Notifications are sent to every device where you have enabled notifications.
              </span>
            </label>

            <label className="block text-xs text-zinc-500">
              Repeats
              <select
                value={draft.recurrence}
                onChange={(e) => set("recurrence", e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            {draft.recurrence === "custom" && (
              <div>
                <p className="mb-1 text-xs text-zinc-500">On these days</p>
                <div className="flex gap-1.5">
                  {WEEKDAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleRecurrenceDay(day)}
                      className={`h-8 w-8 rounded-full text-xs font-medium ${
                        draft.recurrenceDays.includes(day)
                          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {draft.recurrence !== "none" && (
              <label className="block text-xs text-zinc-500">
                Ends on (optional)
                <input
                  type="date"
                  value={draft.recurrenceEndDate}
                  onChange={(e) => set("recurrenceEndDate", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </label>
            )}

            {offline && (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                You&apos;re offline — reconnect to {isExisting ? "save changes to" : "create"} this{" "}
                {isTask ? "task" : "event"}.
              </p>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving || offline}
                className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {saving
                  ? "Saving…"
                  : isExisting
                    ? "Save changes"
                    : isTask
                      ? "Create task"
                      : "Create event"}
              </button>
              <button
                type="button"
                onClick={() => (isExisting ? setEditing(false) : onClose())}
                className="rounded-xl border border-zinc-200 px-4 text-sm text-zinc-500 dark:border-zinc-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ConflictPanel({
  conflicts,
  onCancel,
  onChangeTime,
  onSaveAnyway,
  saving,
}: {
  conflicts: CalendarEvent[];
  onCancel: () => void;
  onChangeTime: () => void;
  onSaveAnyway: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Schedule conflict</h2>
      <div className="space-y-2">
        {conflicts.map((c) => (
          <p key={c.occurrenceId} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="font-medium">{c.title}</span> overlaps this event from{" "}
            {c.allDay ? "all day" : `${formatTime12h(c.startTime)} – ${formatTime12h(c.endTime)}`}.
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={onSaveAnyway}
          disabled={saving}
          className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {saving ? "Saving…" : "Save anyway"}
        </button>
        <button
          onClick={onChangeTime}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          Change time
        </button>
        <button onClick={onCancel} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-500 dark:border-zinc-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

function EventDetails({
  event,
  categories,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleComplete,
  saving,
  offline,
  error,
}: {
  event: CalendarEvent;
  categories: CategoryDef[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleComplete: () => void;
  saving: boolean;
  offline: boolean;
  error: string;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [showNewTimer, setShowNewTimer] = useState(false);
  const [shares, setShares] = useState<EventShare[]>([]);
  const [sharing, setSharing] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const isTask = event.itemType === "task";
  const multiDay = !isTask && event.endDate && event.endDate !== event.date;
  const pMeta = priorityMeta(event.priority);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/timers?linkedType=schedule&linkedId=${event.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTimers(data);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/schedule/${event.id}/share`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setShares(data);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  function upsertTimer(timer: Timer) {
    setTimers((prev) =>
      prev.some((t) => t.id === timer.id) ? prev.map((t) => (t.id === timer.id ? timer : t)) : [timer, ...prev]
    );
  }

  function removeTimer(id: string) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }

  async function createShareLink() {
    setSharing(true);
    try {
      const res = await fetch(`/api/schedule/${event.id}/share`, { method: "POST" });
      if (res.ok) {
        const share = await res.json();
        setShares((prev) => [share, ...prev]);
      }
    } finally {
      setSharing(false);
    }
  }

  async function revokeShare(id: string) {
    setShares((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/shares/${id}`, { method: "DELETE" });
  }

  function copyShareLink(share: EventShare) {
    const url = `${window.location.origin}/invite/${share.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedShareId(share.id);
      setTimeout(() => setCopiedShareId((id) => (id === share.id ? null : id)), 1500);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {isTask && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              ☐ Task
            </span>
          )}
          {event.category && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={categoryChipStyle(event.category, categories)}>
              {event.category}
            </span>
          )}
          {event.priority !== "normal" && (
            <span className={`flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800 ${pMeta.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${pMeta.dot}`} />
              {pMeta.label}
            </span>
          )}
          {event.recurrence !== "none" && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">🔁 Recurring</span>
          )}
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          ✕
        </button>
      </div>

      <h2 className={`text-lg font-semibold ${event.completed ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"}`}>
        {event.title}
      </h2>

      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        {isTask
          ? `Due ${formatDateLabel(event.date)}${!event.allDay ? ` · ${formatTime12h(event.startTime)}` : ""}`
          : event.allDay
            ? multiDay
              ? `${event.date} – ${event.endDate}`
              : `${event.date} · All day`
            : multiDay
              ? `${event.date} ${formatTime12h(event.startTime)} – ${event.endDate} ${formatTime12h(event.endTime)}`
              : `${event.date} · ${formatTime12h(event.startTime)} – ${formatTime12h(event.endTime)}`}
      </p>

      {event.location && <p className="text-sm text-zinc-600 dark:text-zinc-300">📍 {event.location}</p>}

      {event.subject && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {event.subject}
          {event.estimatedHours != null && ` · ~${event.estimatedHours}h estimated`}
        </p>
      )}

      {event.notes && (
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{event.notes}</p>
      )}

      {event.reminderMinutesBefore != null && (
        <p className="text-xs text-zinc-400">
          Reminder: {reminderOffsetLabel(event.reminderMinutesBefore, isTask)}
        </p>
      )}

      <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Timer</p>
        {timers.length > 0 && (
          <ul className="space-y-2">
            {timers.map((t) => (
              <li key={t.id}>
                <TimerCard timer={t} showLink={false} onUpdated={upsertTimer} onDeleted={removeTimer} />
              </li>
            ))}
          </ul>
        )}
        {showNewTimer ? (
          <NewTimerForm
            defaultLabel={event.title}
            linkedType="schedule"
            linkedId={event.id}
            onCreated={(t) => {
              upsertTimer(t);
              setShowNewTimer(false);
            }}
            onCancel={() => setShowNewTimer(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNewTimer(true)}
            className="w-full rounded-xl border border-dashed border-zinc-200 py-2 text-xs text-zinc-500 dark:border-zinc-800"
          >
            + Start timer for this event
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Share</p>
        {shares.length > 0 && (
          <ul className="space-y-2">
            {shares.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-sm dark:bg-zinc-900"
              >
                <span className="truncate text-zinc-500">
                  {typeof window !== "undefined" ? window.location.host : ""}/invite/{s.token}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => copyShareLink(s)}
                    className="rounded-lg border border-zinc-200 px-2 py-1 font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    {copiedShareId === s.id ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeShare(s.id)}
                    className="rounded-lg px-2 py-1 text-zinc-300 hover:text-red-500"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={createShareLink}
          disabled={sharing}
          className="w-full rounded-xl border border-dashed border-zinc-200 py-2 text-xs text-zinc-500 disabled:opacity-40 dark:border-zinc-800"
        >
          {sharing ? "Generating…" : "+ Get share link"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={onToggleComplete}
          disabled={offline}
          className={`rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40 ${
            event.completed
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          }`}
        >
          {event.completed ? (isTask ? "Reopen task" : "✓ Completed") : "Mark complete"}
        </button>
        <button
          onClick={onEdit}
          className="flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Edit
        </button>
        <button
          onClick={onDuplicate}
          disabled={offline || saving}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
        >
          Duplicate
        </button>
        {confirmingDelete ? (
          <button
            onClick={onDelete}
            disabled={saving || offline}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "…" : "Confirm delete"}
          </button>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={offline}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-red-500 disabled:opacity-40 dark:border-zinc-700"
          >
            Delete
          </button>
        )}
      </div>
      {offline && <p className="text-xs text-zinc-400">You&apos;re offline — reconnect to make changes.</p>}
    </div>
  );
}
