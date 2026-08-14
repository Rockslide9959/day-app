import { describe, expect, it } from "vitest";
import { filterVisibleEvents, normalizeCachedEvent } from "@/lib/calendarFilter";

describe("filterVisibleEvents", () => {
  const events = [
    { id: "1", category: "University" },
    { id: "2", category: "Exercise" },
    { id: "3", category: null },
    { id: "4", category: "University" },
  ];

  it("returns everything when nothing is hidden", () => {
    expect(filterVisibleEvents(events, new Set())).toHaveLength(4);
  });

  it("excludes events whose category is hidden", () => {
    const result = filterVisibleEvents(events, new Set(["Exercise"]));
    expect(result.map((e) => e.id)).toEqual(["1", "3", "4"]);
  });

  it("treats a null category as 'Other' for filtering purposes", () => {
    const result = filterVisibleEvents(events, new Set(["Other"]));
    expect(result.map((e) => e.id)).toEqual(["1", "2", "4"]);
  });

  it("accepts a plain array as well as a Set", () => {
    const result = filterVisibleEvents(events, ["University"]);
    expect(result.map((e) => e.id)).toEqual(["2", "3"]);
  });
});

describe("normalizeCachedEvent", () => {
  it("defaults old cached rows without itemType/completedAt to a plain event", () => {
    const oldCachedRow = { id: "1", title: "Dentist", date: "2026-08-14" };
    const normalized = normalizeCachedEvent(oldCachedRow);
    expect(normalized.itemType).toBe("event");
    expect(normalized.completedAt).toBeNull();
    expect(normalized.id).toBe("1");
  });

  it("preserves an existing itemType/completedAt rather than overwriting them", () => {
    const row = { id: "2", itemType: "task", completedAt: "2026-08-10T12:00:00.000Z" };
    const normalized = normalizeCachedEvent(row);
    expect(normalized.itemType).toBe("task");
    expect(normalized.completedAt).toBe("2026-08-10T12:00:00.000Z");
  });
});
