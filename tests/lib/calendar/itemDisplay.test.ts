import { describe, expect, it } from "vitest";
import {
  buildItemAriaLabel,
  getItemVisualStyle,
  moreIndicatorLabel,
  mutedCategoryHex,
  priorityDotInfo,
} from "@/lib/calendar/itemDisplay";
import { CategoryDef } from "@/lib/calendar/categories";

const categories: CategoryDef[] = [
  { name: "University", colorHex: "#3b82f6" },
  { name: "Assignment", colorHex: "#f59e0b" },
  { name: "Other", colorHex: "#71717a" },
];

describe("getItemVisualStyle", () => {
  it("gives events a solid background with no dashed outline", () => {
    const style = getItemVisualStyle({ itemType: "event", category: "University", completed: false }, categories);
    expect(style.kind).toBe("event");
    expect(style.dashed).toBe(false);
    expect(style.background.toLowerCase()).toBe("#3b82f6");
  });

  it("gives tasks the same category background but flags dashed", () => {
    const style = getItemVisualStyle({ itemType: "task", category: "University", completed: false }, categories);
    expect(style.kind).toBe("task");
    expect(style.dashed).toBe(true);
    expect(style.background.toLowerCase()).toBe("#3b82f6");
  });

  it("keeps a completed task dashed and distinguishable from an event", () => {
    const task = getItemVisualStyle({ itemType: "task", category: "Assignment", completed: true }, categories);
    const event = getItemVisualStyle({ itemType: "event", category: "Assignment", completed: true }, categories);
    expect(task.dashed).toBe(true);
    expect(event.dashed).toBe(false);
  });

  it("mutes a completed item's color instead of collapsing it to plain grey", () => {
    const active = getItemVisualStyle({ itemType: "task", category: "Assignment", completed: false }, categories);
    const completed = getItemVisualStyle({ itemType: "task", category: "Assignment", completed: true }, categories);
    expect(completed.background).not.toBe(active.background);
    // Still recognizably derived from the same amber category hue, not a
    // generic zinc/grey (#71717a is "Other"'s color, used here as the
    // "unrelated grey" negative check).
    expect(completed.background.toLowerCase()).not.toBe("#71717a");
  });

  it("falls back to the default category color for an unknown category", () => {
    const style = getItemVisualStyle({ itemType: "event", category: "Nonexistent", completed: false }, categories);
    expect(style.background.toLowerCase()).toBe("#71717a");
  });
});

describe("mutedCategoryHex", () => {
  it("pulls a saturated color toward mid-gray while keeping it a valid hex", () => {
    const muted = mutedCategoryHex("#ef4444");
    expect(muted).toMatch(/^#[0-9a-f]{6}$/);
    expect(muted.toLowerCase()).not.toBe("#ef4444");
  });

  it("expands 3-digit hex shorthand before blending", () => {
    expect(mutedCategoryHex("#fff")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("priorityDotInfo", () => {
  it("returns a red dot for urgent priority", () => {
    expect(priorityDotInfo("urgent")).toEqual({ color: "red", label: "Urgent priority" });
  });

  it("returns an orange dot for high priority", () => {
    expect(priorityDotInfo("high")).toEqual({ color: "orange", label: "High priority" });
  });

  it("returns no dot for normal priority so it consumes no compact chip space", () => {
    expect(priorityDotInfo("normal")).toBeNull();
  });

  it("returns no dot for low priority", () => {
    expect(priorityDotInfo("low")).toBeNull();
  });
});

describe("moreIndicatorLabel", () => {
  it("produces a compact and a verbose label for the same count", () => {
    expect(moreIndicatorLabel(2)).toEqual({ compact: "+2", full: "+2 more" });
  });

  it("never puts a space in the compact label (so it can't wrap)", () => {
    const { compact } = moreIndicatorLabel(5);
    expect(compact).not.toContain(" ");
  });
});

describe("buildItemAriaLabel", () => {
  it("includes 'Task' for a task item", () => {
    const label = buildItemAriaLabel({
      itemType: "task",
      title: "Buy groceries",
      category: "Personal",
      priority: "normal",
      completed: false,
    });
    expect(label).toContain("Task:");
  });

  it("includes 'Event' for an event item", () => {
    const label = buildItemAriaLabel({
      itemType: "event",
      title: "Team meeting",
      category: "Work",
      priority: "normal",
      completed: false,
    });
    expect(label).toContain("Event:");
  });

  it("includes 'High priority' text for high priority items", () => {
    const label = buildItemAriaLabel({
      itemType: "event",
      title: "Review",
      category: null,
      priority: "high",
      completed: false,
    });
    expect(label).toContain("High priority");
  });

  it("includes 'Urgent priority' text for urgent priority items", () => {
    const label = buildItemAriaLabel({
      itemType: "task",
      title: "Submit assignment",
      category: null,
      priority: "urgent",
      completed: false,
    });
    expect(label).toContain("Urgent priority");
  });

  it("omits priority wording for normal/low priority", () => {
    const label = buildItemAriaLabel({
      itemType: "event",
      title: "Lunch",
      category: null,
      priority: "low",
      completed: false,
    });
    expect(label).not.toContain("priority");
  });

  it("includes 'Completed' for a completed task", () => {
    const label = buildItemAriaLabel({
      itemType: "task",
      title: "Buy groceries",
      category: null,
      priority: "normal",
      completed: true,
    });
    expect(label).toContain("Completed");
  });

  it("includes the time label and category when provided", () => {
    const label = buildItemAriaLabel(
      { itemType: "event", title: "Standup", category: "Work", priority: "normal", completed: false },
      "9:00 AM–9:15 AM"
    );
    expect(label).toContain("Work");
    expect(label).toContain("9:00 AM–9:15 AM");
  });
});
