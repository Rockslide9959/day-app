import { describe, expect, it } from "vitest";
import { remainingStudyHours } from "@/lib/calendar/studyPlanner";

describe("remainingStudyHours", () => {
  it("subtracts scheduled hours from the estimate", () => {
    expect(remainingStudyHours(8, 3)).toBe(5);
  });

  it("never goes negative once fully scheduled", () => {
    expect(remainingStudyHours(4, 6)).toBe(0);
  });

  it("rounds to one decimal place", () => {
    expect(remainingStudyHours(5, 1.75)).toBe(3.3);
  });

  it("rounds a messier fraction to one decimal place", () => {
    expect(remainingStudyHours(5, 1.666)).toBe(3.3);
  });
});
