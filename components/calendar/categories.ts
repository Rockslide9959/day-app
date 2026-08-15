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

// White or near-black text, whichever contrasts better against the given
// hex background — categories carry arbitrary custom colors, so we can't
// assume a fixed text color reads well on all of them.
export function readableTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1c1917" : "#ffffff";
}

// Solid category-colored background for event chips/blocks, like a phone's
// built-in calendar — bolder and easier to scan than a tinted background
// with a small dot.
export function categoryEventStyle(category: string | null | undefined, categories: CategoryDef[]): CSSProperties {
  const hex = categoryColorHex(category, categories);
  return { backgroundColor: hex, color: readableTextColor(hex) };
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
