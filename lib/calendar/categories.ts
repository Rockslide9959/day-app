export type CategoryDef = { name: string; colorHex: string };

// Built-in defaults — not stored as rows. Custom categories the user adds
// in Settings (EventCategory table) are merged on top of these at the API
// layer (see app/api/categories/route.ts).
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: "University", colorHex: "#3b82f6" },
  { name: "Study", colorHex: "#8b5cf6" },
  { name: "Assignment", colorHex: "#f59e0b" },
  { name: "Test", colorHex: "#ef4444" },
  { name: "Exam", colorHex: "#dc2626" },
  { name: "Work", colorHex: "#0ea5e9" },
  { name: "Personal", colorHex: "#10b981" },
  { name: "Appointment", colorHex: "#14b8a6" },
  { name: "Exercise", colorHex: "#84cc16" },
  { name: "Social", colorHex: "#ec4899" },
  { name: "Other", colorHex: "#71717a" },
];

// Categories that get deadline/countdown treatment on the dashboard.
const DEADLINE_CATEGORIES = new Set(["Assignment", "Test", "Exam"]);

export function isDeadlineCategory(category: string | null | undefined): boolean {
  return category != null && DEADLINE_CATEGORIES.has(category);
}

export function categoryColor(category: string | null | undefined, all: CategoryDef[] = DEFAULT_CATEGORIES): string {
  const found = all.find((c) => c.name === category);
  return found?.colorHex || "#71717a";
}
