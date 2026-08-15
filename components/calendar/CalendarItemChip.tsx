import { ItemVisualStyle, PriorityDot } from "@/lib/calendar/itemDisplay";

// Shared with any other spot (e.g. the day-agenda swatch, the legend) that
// needs to draw the same "task" dashed inset outline without pulling in
// the whole chip — a pseudo-element inset overlay rather than a real
// border so it never eats into the title's available width.
export const DASHED_TASK_OVERLAY_CLASS =
  "after:pointer-events-none after:absolute after:inset-[2px] after:rounded-sm after:border after:border-dashed after:border-current after:opacity-60";

// The shared "body" for a calendar item everywhere it renders (month cell,
// all-day row, timed block, timed-task marker): a solid category-colored
// background, an inset dashed outline for tasks (via a pseudo-element so it
// never eats into the title's width like a real border would), and a small
// corner priority dot. Positioning (absolute/flex/height) is the caller's
// job since that differs per view — this only renders the inner content.
export default function CalendarItemChip({
  visual,
  title,
  completed,
  dot,
  subtitle,
  dense = false,
}: {
  visual: ItemVisualStyle;
  title: string;
  completed: boolean;
  dot: PriorityDot;
  // Optional second line (e.g. a timed event's "9:00 AM–10:30 AM"),
  // shown only when the caller has room for it.
  subtitle?: string;
  // Tighter padding/text size for month-view cells, where every pixel of
  // width matters.
  dense?: boolean;
}) {
  return (
    <span
      style={{ backgroundColor: visual.background, color: visual.color }}
      className={`relative flex h-full w-full min-w-0 flex-col justify-center overflow-hidden rounded ${
        dense ? "px-1 py-1 text-[11px] leading-tight sm:px-1.5 sm:text-xs" : "px-2 py-1 text-xs"
      } ${visual.dashed ? DASHED_TASK_OVERLAY_CLASS : ""}`}
    >
      <span className={`truncate font-medium ${dot ? "pr-2" : ""} ${completed ? "opacity-80 line-through" : ""}`}>
        {title}
      </span>
      {subtitle && (
        <span className={`truncate text-[11px] opacity-90 ${dot ? "pr-2" : ""}`}>{subtitle}</span>
      )}
      {dot && (
        <span
          aria-hidden="true"
          className={`absolute right-1 top-1 h-[5px] w-[5px] shrink-0 rounded-full ring-1 ring-white/70 dark:ring-black/50 ${
            dot.color === "red" ? "bg-red-500" : "bg-orange-500"
          }`}
        />
      )}
    </span>
  );
}
