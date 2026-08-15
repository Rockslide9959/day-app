import { categoryColorHex, readableTextColor } from "@/components/calendar/categories";
import { CategoryDef } from "./categories";

export type ItemKind = "event" | "task";

export type CalendarItemLike = {
  itemType: string;
  category: string | null | undefined;
  completed: boolean;
};

export type ItemVisualStyle = {
  kind: ItemKind;
  // Solid for both events and tasks — tasks are distinguished by `dashed`,
  // not by a weaker/tinted background, so the category color stays equally
  // readable for both.
  background: string;
  color: string;
  dashed: boolean;
};

// Blends a category hex color toward a mid-gray so a completed item keeps
// its category's hue (just muted) instead of collapsing into a generic
// grey block that loses category identity.
export function mutedCategoryHex(hex: string, factor = 0.55): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (channel: number) => Math.round(channel + (150 - channel) * factor);
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

// The shared visual language for calendar items everywhere they render:
// events are solid category-colored blocks, tasks use the same category
// color but are flagged `dashed` so callers render the inset dashed
// outline instead of a checkbox. Completed items get a muted version of
// their category color rather than a generic grey block.
export function getItemVisualStyle(item: CalendarItemLike, categories: CategoryDef[]): ItemVisualStyle {
  const kind: ItemKind = item.itemType === "task" ? "task" : "event";
  const baseHex = categoryColorHex(item.category, categories);
  const hex = item.completed ? mutedCategoryHex(baseHex) : baseHex;
  return {
    kind,
    background: hex,
    color: readableTextColor(hex),
    dashed: kind === "task",
  };
}

export type PriorityDot = { color: "orange" | "red"; label: string } | null;

// Only high/urgent priority earns a corner dot in compact displays — low
// and normal priority stay invisible so they never consume chip space.
export function priorityDotInfo(priority: string): PriorityDot {
  if (priority === "urgent") return { color: "red", label: "Urgent priority" };
  if (priority === "high") return { color: "orange", label: "High priority" };
  return null;
}

// The two label variants for a month cell's "+N more" indicator — compact
// for narrow mobile columns (where "more" would wrap), verbose once
// there's room to spell it out.
export function moreIndicatorLabel(remaining: number): { compact: string; full: string } {
  return { compact: `+${remaining}`, full: `+${remaining} more` };
}

export type AccessibleItemInfo = {
  itemType: string;
  title: string;
  category: string | null | undefined;
  priority: string;
  completed: boolean;
};

// Builds the accessible name for a calendar item control. Screen reader
// users need item type, priority and completed state spelled out even
// though sighted users get them from a dashed outline and a colored dot.
export function buildItemAriaLabel(item: AccessibleItemInfo, timeLabel?: string): string {
  const kind = item.itemType === "task" ? "Task" : "Event";
  const parts = [`${kind}: ${item.title}`];
  if (item.category) parts.push(item.category);
  if (timeLabel) parts.push(timeLabel);
  if (item.priority === "high") parts.push("High priority");
  if (item.priority === "urgent") parts.push("Urgent priority");
  if (item.completed) parts.push("Completed");
  return parts.join(", ");
}
