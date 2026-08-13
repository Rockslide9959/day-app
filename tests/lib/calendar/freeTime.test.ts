import { describe, expect, it } from "vitest";
import { findFreeSlots } from "@/lib/calendar/freeTime";

describe("findFreeSlots", () => {
  it("finds the gap between two events", () => {
    const busy = [
      { startTime: "09:00", endTime: "11:30" },
      { startTime: "13:00", endTime: "15:00" },
    ];
    const slots = findFreeSlots(busy, 60, "08:00", "18:00");
    expect(slots).toContainEqual({ startTime: "11:30", endTime: "13:00", minutes: 90 });
    expect(slots).toContainEqual({ startTime: "15:00", endTime: "18:00", minutes: 180 });
  });

  it("excludes gaps shorter than the requested duration", () => {
    const busy = [
      { startTime: "09:00", endTime: "11:30" },
      { startTime: "12:00", endTime: "15:00" },
    ];
    // The 11:30-12:00 gap is only 30 minutes — shouldn't show up for a 60-minute request.
    const slots = findFreeSlots(busy, 60, "08:00", "18:00");
    expect(slots.find((s) => s.startTime === "11:30")).toBeUndefined();
  });

  it("merges overlapping busy periods before finding gaps", () => {
    const busy = [
      { startTime: "09:00", endTime: "10:30" },
      { startTime: "10:00", endTime: "11:00" },
    ];
    const slots = findFreeSlots(busy, 30, "08:00", "12:00");
    expect(slots).toEqual([
      { startTime: "08:00", endTime: "09:00", minutes: 60 },
      { startTime: "11:00", endTime: "12:00", minutes: 60 },
    ]);
  });

  it("returns the whole day when there's nothing scheduled", () => {
    const slots = findFreeSlots([], 30, "08:00", "17:00");
    expect(slots).toEqual([{ startTime: "08:00", endTime: "17:00", minutes: 540 }]);
  });

  it("returns nothing when the day is fully booked", () => {
    const slots = findFreeSlots([{ startTime: "08:00", endTime: "17:00" }], 30, "08:00", "17:00");
    expect(slots).toHaveLength(0);
  });
});
