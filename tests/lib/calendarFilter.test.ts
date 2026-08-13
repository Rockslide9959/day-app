import { describe, expect, it } from "vitest";
import { filterVisibleEvents } from "@/lib/calendarFilter";

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
