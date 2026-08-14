// Extracted so the Calendar page's "hide a category" checklist behavior
// is unit-testable without rendering the page.
export function filterVisibleEvents<T extends { category: string | null }>(
  events: T[],
  hiddenCategories: Set<string> | string[]
): T[] {
  const hidden = hiddenCategories instanceof Set ? hiddenCategories : new Set(hiddenCategories);
  return events.filter((ev) => !hidden.has(ev.category || "Other"));
}

// Cached calendar events were written before `itemType`/`completedAt`
// existed — normalize old rows so they load as plain events instead of
// crashing (or silently misrendering) once the UI relies on those fields.
export function normalizeCachedEvent<T extends Record<string, unknown>>(
  raw: T
): T & { itemType: string; completedAt: string | null } {
  return {
    ...raw,
    itemType: typeof raw.itemType === "string" ? raw.itemType : "event",
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
  };
}
