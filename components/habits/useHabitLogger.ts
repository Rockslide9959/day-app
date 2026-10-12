"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { currentStreak, HabitWithLogs, isDueOn, milestoneAt } from "@/lib/habits";

export type Celebration = { id: number; emoji: string; title: string; detail: string };

function withCount(logs: Record<string, number>, date: string, count: number) {
  const next = { ...logs };
  if (count > 0) next[date] = count;
  else delete next[date];
  return next;
}

// Optimistic habit logging shared by the Today and Habits pages. Updates
// local state first (so the ring, streak and flame react on the tap), then
// PUTs the absolute count, rolling back if the save fails. Saves for the
// same habit are chained so rapid taps on a counter can't land out of order.
export function useHabitLogger(
  habits: HabitWithLogs[],
  setHabits: Dispatch<SetStateAction<HabitWithLogs[]>>,
  today: string
) {
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const queues = useRef(new Map<string, Promise<unknown>>());

  const setCount = useCallback(
    (habit: HabitWithLogs, date: string, count: number) => {
      const before = habit.logs[date] ?? 0;
      if (before === count) return;
      const apply = (c: number) =>
        setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, logs: withCount(h.logs, date, c) } : h)));
      apply(count);

      if (date === today && before < habit.target && count >= habit.target) {
        navigator.vibrate?.(25);
        const updated = { ...habit, logs: withCount(habit.logs, date, count) };
        const streak = currentStreak(updated, today);
        const milestone = milestoneAt(streak);
        const others = habits.filter((h) => h.id !== habit.id && isDueOn(h.days, today));
        const perfect =
          isDueOn(habit.days, today) && others.every((h) => (h.logs[today] ?? 0) >= h.target);
        if (milestone) {
          setCelebration({
            id: Date.now(),
            emoji: milestone.icon,
            title: `${streak}-day streak — ${milestone.label}!`,
            detail: `${habit.emoji} ${habit.name}`,
          });
        } else if (perfect && others.length > 0) {
          setCelebration({ id: Date.now(), emoji: "🌟", title: "Perfect day!", detail: "Every habit done for today" });
        }
      }

      const prev = queues.current.get(habit.id) ?? Promise.resolve();
      const next = prev.then(async () => {
        const res = await fetch(`/api/habits/${habit.id}/log`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, count, today }),
        }).catch(() => null);
        if (!res?.ok) apply(before);
      });
      queues.current.set(habit.id, next);
    },
    [habits, setHabits, today]
  );

  const dismissCelebration = useCallback(() => setCelebration(null), []);

  return { setCount, celebration, dismissCelebration };
}
