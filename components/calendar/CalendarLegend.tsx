import { DASHED_TASK_OVERLAY_CLASS } from "./CalendarItemChip";

// A subtle, collapsed-by-default disclosure explaining the calendar's
// visual system, since color/shape alone (solid vs dashed, dot color)
// shouldn't be the only way to learn what they mean.
export default function CalendarLegend() {
  return (
    <details className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
      <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-full border border-zinc-200 px-3 py-1 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/60">
        Legend
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/40">
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-6 shrink-0 rounded bg-zinc-400 dark:bg-zinc-500" aria-hidden="true" />
          Solid — Event
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`relative h-4 w-6 shrink-0 rounded bg-zinc-400 text-white dark:bg-zinc-500 ${DASHED_TASK_OVERLAY_CLASS}`}
          />
          Dashed — Task
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
          Orange dot — High priority
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-red-500" aria-hidden="true" />
          Red dot — Urgent
        </span>
      </div>
    </details>
  );
}
