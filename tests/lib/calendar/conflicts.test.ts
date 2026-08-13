import { describe, expect, it } from "vitest";
import { eventsOverlap, findConflicts } from "@/lib/calendar/conflicts";

describe("eventsOverlap", () => {
  it("detects overlapping times on the same day", () => {
    const gym = { date: "2026-08-14", startTime: "15:00", endTime: "16:00" };
    const lecture = { date: "2026-08-14", startTime: "14:30", endTime: "15:30" };
    expect(eventsOverlap(gym, lecture)).toBe(true);
  });

  it("does not flag back-to-back events as conflicting", () => {
    const a = { date: "2026-08-14", startTime: "14:00", endTime: "15:00" };
    const b = { date: "2026-08-14", startTime: "15:00", endTime: "16:00" };
    expect(eventsOverlap(a, b)).toBe(false);
  });

  it("does not flag events on different days", () => {
    const a = { date: "2026-08-14", startTime: "10:00", endTime: "11:00" };
    const b = { date: "2026-08-15", startTime: "10:00", endTime: "11:00" };
    expect(eventsOverlap(a, b)).toBe(false);
  });

  it("treats any date-range overlap as a conflict for all-day events", () => {
    const conference = { date: "2026-08-10", endDate: "2026-08-12", startTime: "00:00", endTime: "23:59", allDay: true };
    const meeting = { date: "2026-08-11", startTime: "09:00", endTime: "10:00" };
    expect(eventsOverlap(conference, meeting)).toBe(true);
  });
});

describe("findConflicts", () => {
  it("excludes the candidate's own id when editing an existing event", () => {
    const candidate = { id: "evt-1", date: "2026-08-14", startTime: "15:00", endTime: "16:00" };
    const events = [{ id: "evt-1", title: "Gym", date: "2026-08-14", startTime: "15:00", endTime: "16:00" }];
    expect(findConflicts(candidate, events)).toHaveLength(0);
  });

  it("finds a conflicting event by a different id", () => {
    const candidate = { date: "2026-08-14", startTime: "15:00", endTime: "16:00" };
    const events = [
      { id: "evt-2", title: "Lecture", date: "2026-08-14", startTime: "14:30", endTime: "15:30" },
      { id: "evt-3", title: "Dinner", date: "2026-08-14", startTime: "18:00", endTime: "19:00" },
    ];
    const conflicts = findConflicts(candidate, events);
    expect(conflicts.map((c) => c.title)).toEqual(["Lecture"]);
  });
});
