"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTodayStr } from "@/lib/useTodayStr";
import {
  HabitWithLogs,
  habitColor,
  isDueOn,
  MAX_HABIT_COUNT,
  nextMilestone,
  nextTapCount,
  scheduleLabel,
  summarizeHabit,
} from "@/lib/habits";
import HabitRing from "@/components/habits/HabitRing";
import FlameBadge from "@/components/habits/FlameBadge";
import WeekDots from "@/components/habits/WeekDots";
import HabitForm from "@/components/habits/HabitForm";
import CelebrationToast from "@/components/habits/CelebrationToast";
import { useHabitLogger } from "@/components/habits/useHabitLogger";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useDataChanged } from "@/lib/useDataChanged";

export default function HabitsPage() {
  const today = useTodayStr();
  const [habits, setHabits] = useState<HabitWithLogs[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { setCount, celebration, dismissCelebration } = useHabitLogger(habits, setHabits, today);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/habits?date=${today}&archived=1`);
      if (res.ok) setHabits(await res.json());
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);
  // Refetch when Quick Add changes something while this page is open.
  useDataChanged(load);

  if (loading) return <LoadingSpinner className="min-h-[70vh]" />;

  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);
  const dueToday = active.filter((h) => isDueOn(h.days, today));
  const resting = active.filter((h) => !isDueOn(h.days, today));
  const doneCount = dueToday.filter((h) => (h.logs[today] ?? 0) >= h.target).length;
  const perfect = dueToday.length > 0 && doneCount === dueToday.length;
  const topStreak = Math.max(0, ...active.map((h) => summarizeHabit(h, today).currentStreak));

  // Share of due habit-days hit so far this week (Mon → today).
  let weekDue = 0;
  let weekHit = 0;
  for (const h of active) {
    for (const d of summarizeHabit(h, today).week) {
      if (d.state === "done") weekHit++;
      if (d.state === "done" || d.state === "missed" || d.state === "partial") weekDue++;
    }
  }
  const weekRate = weekDue ? Math.round((weekHit / weekDue) * 100) : 0;

  return (
    <>
    <main className="phase-in mx-auto max-w-2xl px-4 pt-8">
      <div className="mb-5 flex items-center justify-between pr-24">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Habits</h1>
          <p className="text-sm text-zinc-500 crimson:text-crimson-text-secondary">Small things, every day.</p>
        </div>
      </div>

      {active.length > 0 && (
        <section
          className={`relative mb-6 overflow-hidden rounded-3xl p-5 text-white shadow-lg ${
            perfect
              ? "bg-linear-to-br from-amber-400 via-orange-500 to-rose-500"
              : "bg-linear-to-br from-zinc-900 to-zinc-700 dark:from-zinc-800 dark:to-zinc-900 crimson:from-crimson-accent crimson:to-crimson-raised"
          }`}
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-5">
            <ProgressDial done={doneCount} total={dueToday.length} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-tight">
                {perfect ? "Perfect day ✨" : dueToday.length === 0 ? "Rest day" : `${doneCount} of ${dueToday.length} done`}
              </p>
              <p className="mt-0.5 text-xs text-white/70">
                {perfect ? "Every habit checked off. Nice." : dueToday.length === 0 ? "Nothing scheduled today — enjoy it." : "Tap a ring to log it. Hold to undo."}
              </p>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium">🔥 {topStreak} best streak</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium">{weekRate}% this week</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {active.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <>
          <ul className="mb-4 space-y-3">
            {dueToday.map((h) => (
              <HabitCard key={h.id} habit={h} today={today} onSet={setCount} />
            ))}
          </ul>
          {resting.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-400 crimson:text-crimson-text-muted">
                Resting today
              </h2>
              <ul className="mb-4 space-y-3 opacity-75">
                {resting.map((h) => (
                  <HabitCard key={h.id} habit={h} today={today} onSet={setCount} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {active.length > 0 && (
        <button
          onClick={() => setCreating(true)}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 py-4 text-sm font-medium text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:text-zinc-300 crimson:border-crimson-border crimson:text-crimson-text-secondary crimson:hover:border-crimson-accent"
        >
          <span className="text-lg leading-none">＋</span> New habit
        </button>
      )}

      {archived.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600 crimson:text-crimson-text-muted"
          >
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="space-y-2">
              {archived.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/habits/${h.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-900/60 crimson:bg-crimson-surface/60 crimson:text-crimson-text-secondary"
                  >
                    <span className="text-lg grayscale">{h.emoji}</span>
                    {h.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>

      {creating && (
        <HabitForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      <CelebrationToast celebration={celebration} onDone={dismissCelebration} />
    </>
  );
}

function ProgressDial({ done, total }: { done: number; total: number }) {
  const size = 84;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total ? done / total : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="white" strokeOpacity={0.18} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="white"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.3, 1.2, 0.5, 1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums">
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );
}

function HabitCard({
  habit,
  today,
  onSet,
}: {
  habit: HabitWithLogs;
  today: string;
  onSet: (habit: HabitWithLogs, date: string, count: number) => void;
}) {
  const s = summarizeHabit(habit, today);
  const hex = habitColor(habit.color);
  const next = nextMilestone(s.currentStreak);
  const counter = habit.target > 1;

  return (
    <li
      className="relative overflow-hidden rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-900/5 transition dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border"
      style={s.doneToday ? { boxShadow: `0 10px 30px -18px ${hex}` } : undefined}
    >
      {s.doneToday && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(110deg, color-mix(in srgb, ${hex} 12%, transparent), transparent 60%)` }}
        />
      )}
      <div className="relative flex items-center gap-4">
        <HabitRing
          emoji={habit.emoji}
          color={habit.color}
          count={s.todayCount}
          target={habit.target}
          size={64}
          label={`${habit.name}: ${s.todayCount} of ${habit.target}. Tap to log, hold to undo.`}
          onTap={() => onSet(habit, today, nextTapCount(habit, s.todayCount))}
          onLongPress={() => onSet(habit, today, Math.max(0, s.todayCount - 1))}
        />
        <Link href={`/habits/${habit.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={`truncate font-semibold ${
                s.doneToday ? "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text" : "text-zinc-800 dark:text-zinc-100 crimson:text-crimson-text"
              }`}
            >
              {habit.name}
            </p>
            <FlameBadge streak={s.currentStreak} />
          </div>
          <p className="mb-2 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
            {counter ? `${habit.target}${habit.unit ? ` ${habit.unit}` : "×"} · ` : ""}
            {scheduleLabel(habit.days)}
          </p>
          <WeekDots week={s.week} color={habit.color} today={today} />
        </Link>
        {counter && (
          <div className="flex flex-col gap-1">
            <StepButton label={`Add one ${habit.unit ?? ""}`} onClick={() => onSet(habit, today, Math.min(MAX_HABIT_COUNT, s.todayCount + 1))} hex={hex}>
              +
            </StepButton>
            <StepButton label="Remove one" onClick={() => onSet(habit, today, Math.max(0, s.todayCount - 1))} disabled={s.todayCount === 0}>
              −
            </StepButton>
          </div>
        )}
      </div>
      {next && s.currentStreak > 0 && (
        <div className="relative mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 crimson:bg-crimson-raised">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(s.currentStreak / next.days) * 100}%`, background: hex }}
            />
          </div>
          <span className="shrink-0 text-[10px] font-medium text-zinc-400 crimson:text-crimson-text-muted">
            {next.days - s.currentStreak} to {next.icon} {next.label}
          </span>
        </div>
      )}
    </li>
  );
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
  hex,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hex?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-base font-bold transition active:scale-90 disabled:opacity-30 ${
        hex ? "text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300 crimson:bg-crimson-raised crimson:text-crimson-text-secondary"
      }`}
      style={hex ? { background: hex } : undefined}
    >
      {children}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mb-8 rounded-3xl bg-linear-to-br from-emerald-50 via-sky-50 to-violet-50 px-6 py-10 text-center dark:from-emerald-950/30 dark:via-sky-950/20 dark:to-violet-950/30 crimson:from-crimson-surface crimson:via-crimson-raised crimson:to-crimson-surface">
      <div className="mb-4 flex justify-center gap-3 text-3xl">
        <span className="habit-pop">💧</span>
        <span className="habit-pop [animation-delay:120ms]">📚</span>
        <span className="habit-pop [animation-delay:240ms]">🏃</span>
      </div>
      <p className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Build your first streak</p>
      <p className="mx-auto mb-5 max-w-xs text-sm text-zinc-500 crimson:text-crimson-text-secondary">
        Track check-offs or counts, pick the days that matter, and watch the flame grow.
      </p>
      <button
        onClick={onCreate}
        className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-lg transition active:scale-95 dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
      >
        Start a habit
      </button>
    </div>
  );
}
