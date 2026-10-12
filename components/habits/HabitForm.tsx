"use client";

import { useState } from "react";
import { HABIT_COLORS, HabitWithLogs, MAX_HABIT_NAME, parseDays, scheduleLabel } from "@/lib/habits";
import HabitRing from "./HabitRing";

const EMOJIS = ["💧", "🏃", "📚", "🧘", "💪", "🥗", "😴", "✍️", "🎸", "🧹", "💊", "🚶", "🌱", "🙏", "📵", "☀️", "🧠", "🎨", "🦷", "🍎", "💻", "🗣️", "🚴", "✨"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const PRESETS: { label: string; days: number[] }[] = [
  { label: "Every day", days: [] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [0, 6] },
];

// One sheet for creating and editing a habit, with a live preview ring
// that reflects every choice as it's made. Saves itself and reports back.
export default function HabitForm({
  habit,
  onClose,
  onSaved,
  onDelete,
}: {
  habit?: HabitWithLogs;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? EMOJIS[0]);
  const [color, setColor] = useState(habit?.color ?? "emerald");
  const [counter, setCounter] = useState((habit?.target ?? 1) > 1);
  const [target, setTarget] = useState(Math.max(2, habit?.target ?? 8));
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [days, setDays] = useState<number[]>(parseDays(habit?.days ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewCount, setPreviewCount] = useState(0);

  const effectiveTarget = counter ? target : 1;

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = prev.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : [...prev];
      const updated = next.includes(d) ? next.filter((x) => x !== d) : [...next, d];
      // A habit needs at least one day; all seven is stored as "every day".
      if (updated.length === 0) return prev;
      return updated.length === 7 ? [] : updated.sort();
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give your habit a name");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(habit ? `/api/habits/${habit.id}` : "/api/habits", {
        method: habit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          emoji,
          color,
          target: effectiveTarget,
          unit: counter ? unit.trim() || null : null,
          days: days.join(","),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't save habit");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save habit");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 crimson:border-crimson-border crimson:bg-crimson-obsidian crimson:focus:border-crimson-accent";
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 crimson:text-crimson-text-secondary";
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 crimson:bg-crimson-raised crimson:text-crimson-text-secondary"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl sm:rounded-3xl dark:bg-zinc-900 crimson:bg-crimson-surface"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
            {habit ? "Edit habit" : "New habit"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-600 crimson:text-crimson-text-muted">
            ✕
          </button>
        </div>

        {/* Live preview — tap it to feel how logging will work. */}
        <div
          className="mb-5 flex items-center gap-4 rounded-2xl p-4"
          style={{ background: `color-mix(in srgb, ${HABIT_COLORS[color]} 10%, transparent)` }}
        >
          <HabitRing
            emoji={emoji}
            color={color}
            count={previewCount}
            target={effectiveTarget}
            size={68}
            label="Preview"
            onTap={() => setPreviewCount((c) => (c >= effectiveTarget ? 0 : c + 1))}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{name.trim() || "Your new habit"}</p>
            <p className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
              {counter ? `${target}${unit.trim() ? ` ${unit.trim()}` : "×"} a day` : "Check off once a day"} · {scheduleLabel(days.join(","))}
            </p>
            <p className="mt-1 text-[11px] text-zinc-400 crimson:text-crimson-text-muted">Tap the ring to try it</p>
          </div>
        </div>

        <label className={labelClass} htmlFor="habit-name">Name</label>
        <input
          id="habit-name"
          autoFocus={!habit}
          value={name}
          maxLength={MAX_HABIT_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder="Drink water, read, stretch…"
          className={`${inputClass} mb-4`}
        />

        <span className={labelClass}>Icon</span>
        <div className="mb-4 grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`flex aspect-square items-center justify-center rounded-xl text-xl transition ${
                emoji === e ? "scale-105 bg-zinc-100 ring-2 dark:bg-zinc-800 crimson:bg-crimson-raised" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 crimson:hover:bg-crimson-raised"
              }`}
              style={emoji === e ? ({ "--tw-ring-color": HABIT_COLORS[color] } as React.CSSProperties) : undefined}
            >
              {e}
            </button>
          ))}
        </div>

        <span className={labelClass}>Color</span>
        <div className="mb-5 flex flex-wrap gap-2.5">
          {Object.entries(HABIT_COLORS).map(([key, hex]) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => setColor(key)}
              className={`h-8 w-8 rounded-full transition ${color === key ? "scale-110 ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-900 crimson:ring-crimson-text crimson:ring-offset-crimson-surface" : "hover:scale-105"}`}
              style={{ background: hex }}
            />
          ))}
        </div>

        <span className={labelClass}>Goal</span>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setCounter(false)} className={`rounded-xl px-3 py-2.5 text-left ${chip(!counter)}`}>
            <span className="block text-sm">✓ Check-off</span>
            <span className="block text-[11px] font-normal opacity-70">Done or not</span>
          </button>
          <button type="button" onClick={() => setCounter(true)} className={`rounded-xl px-3 py-2.5 text-left ${chip(counter)}`}>
            <span className="block text-sm">＋ Counter</span>
            <span className="block text-[11px] font-normal opacity-70">Hit a number</span>
          </button>
        </div>
        {counter && (
          <div className="mb-4 flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-zinc-200 dark:border-zinc-700 crimson:border-crimson-border">
              <button type="button" onClick={() => setTarget((t) => Math.max(2, t - 1))} className="px-3 py-2 text-lg text-zinc-500" aria-label="Decrease goal">−</button>
              <input
                type="number"
                min={2}
                max={999}
                value={target}
                onChange={(e) => setTarget(Math.min(999, Math.max(2, Number(e.target.value) || 2)))}
                className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                aria-label="Daily goal"
              />
              <button type="button" onClick={() => setTarget((t) => Math.min(999, t + 1))} className="px-3 py-2 text-lg text-zinc-500" aria-label="Increase goal">+</button>
            </div>
            <input
              value={unit}
              maxLength={20}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="glasses, pages, min…"
              className={inputClass}
              aria-label="Unit"
            />
          </div>
        )}

        <span className={`${labelClass} mt-4`}>Schedule</span>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setDays(p.days)} className={chip(days.join(",") === p.days.join(","))}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="mb-1 flex justify-between gap-1">
          {DAY_LETTERS.map((l, d) => {
            const on = days.length === 0 || days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                className="h-9 w-9 rounded-full text-xs font-semibold transition"
                style={
                  on
                    ? { background: HABIT_COLORS[color], color: "white" }
                    : { boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${HABIT_COLORS[color]} 35%, transparent)`, color: "#a1a1aa" }
                }
              >
                {l}
              </button>
            );
          })}
        </div>
        <p className="mb-5 text-[11px] text-zinc-400 crimson:text-crimson-text-muted">Days off never break your streak.</p>

        {error && <p className="mb-3 text-sm text-red-600 crimson:text-crimson-highlight">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
          style={{ background: HABIT_COLORS[color], boxShadow: `0 8px 24px -8px ${HABIT_COLORS[color]}` }}
        >
          {saving ? "Saving…" : habit ? "Save changes" : "Start habit"}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-2 w-full rounded-2xl py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 crimson:text-crimson-highlight crimson:hover:bg-crimson-accent/10"
          >
            Delete habit
          </button>
        )}
      </form>
    </div>
  );
}
