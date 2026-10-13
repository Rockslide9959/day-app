// Shared surface and control styles, matching the Today page's look, so
// every page draws its cards, buttons and inputs the same way.

export const CARD =
  "rounded-3xl bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border";

export const PRIMARY_BUTTON =
  "shine rounded-full bg-zinc-900 font-semibold text-white shadow-md shadow-zinc-900/20 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:shadow-none crimson:bg-crimson-accent crimson:text-crimson-text crimson:shadow-crimson-accent/30";

export const GHOST_BUTTON =
  "rounded-full bg-white font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-900/5 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-zinc-800 crimson:bg-crimson-surface crimson:text-crimson-text-secondary crimson:ring-crimson-border crimson:hover:bg-crimson-raised";

export const INPUT =
  "rounded-2xl bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none ring-1 ring-zinc-900/5 transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900/20 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-white/10 dark:focus:ring-white/30 crimson:bg-crimson-surface crimson:text-crimson-text crimson:ring-crimson-border crimson:placeholder:text-crimson-text-muted crimson:focus:ring-crimson-accent/60";

export const SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 crimson:text-crimson-text-muted";

/** Inline style that staggers a list row's `.item-in` animation. */
export function stagger(index: number): React.CSSProperties {
  return { "--i": Math.min(index, 10) } as React.CSSProperties;
}
