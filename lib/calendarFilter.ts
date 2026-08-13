// Extracted so the Calendar page's "hide a category" checklist behavior
// is unit-testable without rendering the page.
export function filterVisibleEvents<T extends { category: string | null }>(
  events: T[],
  hiddenCategories: Set<string> | string[]
): T[] {
  const hidden = hiddenCategories instanceof Set ? hiddenCategories : new Set(hiddenCategories);
  return events.filter((ev) => !hidden.has(ev.category || "Other"));
}
