"use client";

import { useState } from "react";
import { addDaysToDateStr, formatDateLabel } from "@/lib/dates";
import { CARD } from "@/components/ui/styles";

// Previous / next day control. The date label slides in from the side the
// user moved towards, and a "Today" chip appears once they step away.
export default function DateStepper({
  date,
  today,
  onChange,
  className = "",
}: {
  date: string;
  today?: string;
  onChange: (date: string) => void;
  className?: string;
}) {
  // Slide direction follows whichever way the date moved, however it changed
  // (arrows, the Today chip, or another tab syncing the date).
  const [prevDate, setPrevDate] = useState(date);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  if (date !== prevDate) {
    setPrevDate(date);
    setDirection(date > prevDate ? "next" : "prev");
  }
  const step = (days: number) => onChange(addDaysToDateStr(date, days));
  const arrow =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 crimson:text-crimson-text-muted crimson:hover:bg-crimson-raised crimson:hover:text-crimson-text";

  return (
    <div className={`${CARD} flex items-center justify-between gap-2 px-2 py-2 ${className}`}>
      <button type="button" onClick={() => step(-1)} className={arrow} aria-label="Previous day">
        ←
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
        <span
          key={date}
          className={`truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text ${
            direction === "next" ? "swap-in-next" : "swap-in-prev"
          }`}
        >
          {formatDateLabel(date)}
        </span>
        {today && date !== today && (
          <button
            type="button"
            onClick={() => {
              onChange(today);
            }}
            title="Jump back to today"
            aria-label="Jump back to today"
            className="check-pop shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 crimson:bg-crimson-raised crimson:text-crimson-highlight"
          >
            {/* Arrow points the way back so it reads as an action, not a second label. */}
            {date > today ? "← Today" : "Today →"}
          </button>
        )}
      </div>
      <button type="button" onClick={() => step(1)} className={arrow} aria-label="Next day">
        →
      </button>
    </div>
  );
}
