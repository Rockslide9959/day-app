import { describe, expect, it } from "vitest";
import { countdownLabel, deadlineInfo } from "@/lib/calendar/deadlines";

describe("deadlineInfo", () => {
  it("labels a future deadline in days", () => {
    const info = deadlineInfo("2026-08-19", "2026-08-13");
    expect(info.daysUntil).toBe(6);
    expect(info.label).toBe("Due in 6 days");
    expect(info.urgency).toBe("normal");
  });

  it("labels today as due today", () => {
    expect(deadlineInfo("2026-08-13", "2026-08-13").label).toBe("Due today");
  });

  it("labels tomorrow specially", () => {
    expect(deadlineInfo("2026-08-14", "2026-08-13").label).toBe("Due tomorrow");
  });

  it("labels a past date as overdue", () => {
    const info = deadlineInfo("2026-08-11", "2026-08-13");
    expect(info.label).toBe("Overdue by 2 days");
    expect(info.urgency).toBe("overdue");
  });

  it("marks anything within 3 days as soon", () => {
    expect(deadlineInfo("2026-08-16", "2026-08-13").urgency).toBe("soon");
    expect(deadlineInfo("2026-08-20", "2026-08-13").urgency).toBe("normal");
  });

  it("supports a custom verb, e.g. for exams", () => {
    expect(deadlineInfo("2026-08-25", "2026-08-13", "Exam").label).toBe("Exam in 12 days");
  });
});

describe("countdownLabel", () => {
  it("reads naturally for near dates", () => {
    expect(countdownLabel("2026-08-13", "2026-08-13")).toBe("Today");
    expect(countdownLabel("2026-08-14", "2026-08-13")).toBe("Tomorrow");
    expect(countdownLabel("2026-09-10", "2026-08-13")).toBe("In 28 days");
  });
});
