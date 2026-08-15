import { describe, expect, it } from "vitest";
import { categoryColorHex, readableTextColor } from "@/components/calendar/categories";
import { CategoryDef } from "@/lib/calendar/categories";

const categories: CategoryDef[] = [
  { name: "University", colorHex: "#3b82f6" },
  { name: "Custom Light", colorHex: "#fef08a" },
];

describe("categoryColorHex", () => {
  it("returns the matching category's color", () => {
    expect(categoryColorHex("University", categories)).toBe("#3b82f6");
  });

  it("falls back to a neutral color for an unknown/null category", () => {
    expect(categoryColorHex(null, categories)).toBe("#71717a");
    expect(categoryColorHex("Nope", categories)).toBe("#71717a");
  });
});

describe("readableTextColor", () => {
  it("picks dark text on a light custom category color", () => {
    expect(readableTextColor("#fef08a")).toBe("#1c1917");
  });

  it("picks white text on a dark/saturated category color", () => {
    expect(readableTextColor("#3b82f6")).toBe("#ffffff");
    expect(readableTextColor("#dc2626")).toBe("#ffffff");
  });

  it("handles 3-digit hex shorthand", () => {
    expect(readableTextColor("#fff")).toBe("#1c1917");
    expect(readableTextColor("#000")).toBe("#ffffff");
  });
});
