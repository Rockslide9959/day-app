import type { CSSProperties } from "react";
import type { CategoryDef } from "@/lib/calendar/categories";

export function categoryColorHex(category: string | null | undefined, categories: CategoryDef[]): string {
  const found = categories.find((c) => c.name === category);
  return found?.colorHex || "#71717a";
}

export function categoryDotStyle(category: string | null | undefined, categories: CategoryDef[]): CSSProperties {
  return { backgroundColor: categoryColorHex(category, categories) };
}

// Light tinted background + full-strength text, computed from the
// category's own hex since categories (including custom ones) carry
// arbitrary colors rather than a fixed Tailwind palette.
export function categoryChipStyle(category: string | null | undefined, categories: CategoryDef[]): CSSProperties {
  const hex = categoryColorHex(category, categories);
  return { backgroundColor: `${hex}22`, color: hex };
}

export const PRIORITY_META: Record<string, { label: string; dot: string; text: string }> = {
  low: { label: "Low", dot: "bg-zinc-300 dark:bg-zinc-600", text: "text-zinc-400" },
  normal: { label: "Normal", dot: "bg-zinc-400 dark:bg-zinc-500", text: "text-zinc-500" },
  high: { label: "High", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  urgent: { label: "Urgent", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
};

export function priorityMeta(priority: string) {
  return PRIORITY_META[priority] || PRIORITY_META.normal;
}
