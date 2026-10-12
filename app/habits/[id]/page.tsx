"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTodayStr } from "@/lib/useTodayStr";
import {
  HabitWithLogs,
  habitColor,
  heatmapColumns,
  MAX_HABIT_COUNT,
  MILESTONES,
  nextMilestone,
  nextTapCount,
  scheduleLabel,
  summarizeHabit,
} from "@/lib/habits";
import HabitRing from "@/components/habits/HabitRing";
import FlameBadge from "@/components/habits/FlameBadge";
import Heatmap from "@/components/habits/Heatmap";
import HabitForm from "@/components/habits/HabitForm";
import CelebrationToast from "@/components/habits/CelebrationToast";
import { useHabitLogger } from "@/components/habits/useHabitLogger";
import BackButton from "@/components/BackButton";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function HabitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const today = useTodayStr();
  // Held as a one-item list so it can share useHabitLogger with the list pages.
  const [habits, setHabits] = useState<HabitWithLogs[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const { setCount, celebration, dismissCelebration } = useHabitLogger(habits, setHabits, today);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/habits/${id}?date=${today}`);
      if (res.status === 404) setNotFound(true);
      else if (res.ok) setHabits([await res.json()]);
    } finally {
      setLoading(false);
    }
  }, [id, today]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/habits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function remove() {
    if (!confirm("Delete this habit and its whole history? This can't be undone.")) return;
    const res = await fetch(`/api/habits/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/habits");
  }

  if (loading) return <LoadingSpinner className="min-h-[70vh]" />;
  const habit = habits[0];
  if (notFound || !habit) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-8">
        <BackButton href="/habits">Habits</BackButton>
        <p className="mt-6 text-sm text-zinc-500">That habit doesn&apos;t exist anymore.</p>
      </main>
    );
  }

  const s = summarizeHabit(habit, today);
  const hex = habitColor(habit.color);
  const next = nextMilestone(s.currentStreak);
  const counter = habit.target > 1;

  return (
    <>
      <main className="phase-in mx-auto max-w-2xl px-4 pt-8">
        <div className="mb-5 flex items-center gap-2 pr-24">
          <BackButton href="/habits">Habits</BackButton>
        </div>

        {/* Hero */}
        <section
          className="relative mb-5 overflow-hidden rounded-3xl p-6 text-center"
          style={{ background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${hex} 28%, transparent), color-mix(in srgb, ${hex} 6%, transparent) 70%)` }}
        >
          <div className="mb-3 flex justify-center">
            <HabitRing
              emoji={habit.emoji}
              color={habit.color}
              count={s.todayCount}
              target={habit.target}
              size={128}
              disabled={habit.archived}
              label={`${habit.name}: ${s.todayCount} of ${habit.target} today. Tap to log, hold to undo.`}
              onTap={() => setCount(habit, today, nextTapCount(habit, s.todayCount))}
              onLongPress={() => setCount(habit, today, Math.max(0, s.todayCount - 1))}
            />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{habit.name}</h1>
          <p className="mt-0.5 text-sm text-zinc-500 crimson:text-crimson-text-secondary">
            {counter ? `${habit.target}${habit.unit ? ` ${habit.unit}` : "×"} a day · ` : ""}
            {scheduleLabel(habit.days)}
            {habit.archived && " · Archived"}
          </p>
          {counter && !habit.archived && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setCount(habit, today, Math.max(0, s.todayCount - 1))}
                disabled={s.todayCount === 0}
                className="h-10 w-10 rounded-full bg-white/70 text-xl font-bold text-zinc-600 shadow-sm transition active:scale-90 disabled:opacity-30 dark:bg-zinc-900/70 dark:text-zinc-300 crimson:bg-crimson-surface crimson:text-crimson-text-secondary"
                aria-label="Remove one"
              >
                −
              </button>
              <span className="min-w-20 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
                {s.todayCount}
                <span className="text-base font-medium text-zinc-400"> / {habit.target}</span>
              </span>
              <button
                onClick={() => setCount(habit, today, Math.min(MAX_HABIT_COUNT, s.todayCount + 1))}
                className="h-10 w-10 rounded-full text-xl font-bold text-white shadow-md transition active:scale-90"
                style={{ background: hex }}
                aria-label="Add one"
              >
                +
              </button>
            </div>
          )}
        </section>

        {/* Stats */}
        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Current streak" value={<FlameBadge streak={s.currentStreak} className="text-2xl [&>svg]:h-6 [&>svg]:w-6" />} />
          <Stat label="Best streak" value={`${s.bestStreak}d`} />
          <Stat label="Last 30 days" value={`${Math.round(s.rate30 * 100)}%`} />
          <Stat label="Check-ins" value={s.totalDone} />
        </section>

        {next && (
          <section className={`${CARD} mb-5 p-4`}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
                Next: {next.icon} {next.label}
              </span>
              <span className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                {s.currentStreak} / {next.days} days
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 crimson:bg-crimson-raised">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(3, (s.currentStreak / next.days) * 100)}%`, background: `linear-gradient(90deg, ${hex}, #facc15)` }}
              />
            </div>
          </section>
        )}

        <section className={`${CARD} mb-5 p-4`}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">History</h2>
            <span className="text-[11px] text-zinc-400 crimson:text-crimson-text-muted">Tap a day to fill or clear it</span>
          </div>
          <Heatmap
            columns={heatmapColumns(habit, today, 20)}
            color={habit.color}
            onToggle={
              habit.archived
                ? undefined
                : (cell) => setCount(habit, cell.date, cell.count >= habit.target ? 0 : habit.target)
            }
          />
        </section>

        <section className={`${CARD} mb-5 p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Trophies</h2>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
            {MILESTONES.map((m) => {
              const earned = s.bestStreak >= m.days;
              return (
                <div key={m.days} className="flex flex-col items-center text-center" title={`${m.days}-day streak`}>
                  <span
                    className={`mb-1 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition ${
                      earned ? "shadow-md" : "bg-zinc-100 grayscale opacity-40 dark:bg-zinc-800 crimson:bg-crimson-raised"
                    }`}
                    style={earned ? { background: `linear-gradient(135deg, color-mix(in srgb, ${hex} 30%, transparent), color-mix(in srgb, #facc15 30%, transparent))` } : undefined}
                  >
                    {m.icon}
                  </span>
                  <span className={`text-[10px] font-medium leading-tight ${earned ? "text-zinc-700 dark:text-zinc-200 crimson:text-crimson-text" : "text-zinc-400 crimson:text-crimson-text-muted"}`}>
                    {m.label}
                  </span>
                  <span className="text-[9px] text-zinc-400 crimson:text-crimson-text-muted">{m.days}d</span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mb-10 grid grid-cols-2 gap-2">
          <button onClick={() => setEditing(true)} className={`${CARD} py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 crimson:text-crimson-text`}>
            ✏️ Edit
          </button>
          <button
            onClick={() => patch({ archived: !habit.archived })}
            className={`${CARD} py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 crimson:text-crimson-text`}
          >
            {habit.archived ? "↩︎ Restore" : "📦 Archive"}
          </button>
        </div>
      </main>

      {editing && (
        <HabitForm
          habit={habit}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
          onDelete={remove}
        />
      )}
      <CelebrationToast celebration={celebration} onDone={dismissCelebration} />
    </>
  );
}

const CARD =
  "rounded-3xl bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <div className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 crimson:text-crimson-text-muted">{label}</div>
    </div>
  );
}
