"use client";

import { useEffect } from "react";
import type { Celebration } from "./useHabitLogger";

// Floating pill above the bottom nav for streak milestones and perfect days.
export default function CelebrationToast({
  celebration,
  onDone,
}: {
  celebration: Celebration | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [celebration, onDone]);

  if (!celebration) return null;
  return (
    <div
      key={celebration.id}
      role="status"
      onClick={onDone}
      className="toast-in fixed bottom-24 left-1/2 z-50 flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-2xl ring-1 ring-white/10 dark:bg-zinc-100 dark:text-zinc-900 crimson:bg-crimson-raised crimson:text-crimson-text crimson:ring-crimson-accent/60"
    >
      <span className="habit-pop text-3xl leading-none">{celebration.emoji}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{celebration.title}</span>
        <span className="block truncate text-xs opacity-70">{celebration.detail}</span>
      </span>
    </div>
  );
}
