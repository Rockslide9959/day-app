import { describe, expect, it } from "vitest";
import { formatDurationMinutes } from "@/lib/dates";

describe("formatDurationMinutes", () => {
  it("formats sub-hour durations as minutes", () => {
    expect(formatDurationMinutes(37)).toBe("37 minutes");
    expect(formatDurationMinutes(1)).toBe("1 minute");
    expect(formatDurationMinutes(0)).toBe("0 minutes");
  });

  it("formats hour-plus durations with minutes remainder", () => {
    expect(formatDurationMinutes(127)).toBe("2 hours and 7 minutes");
    expect(formatDurationMinutes(61)).toBe("1 hour and 1 minute");
  });

  it("omits the minutes clause when the remainder is zero", () => {
    expect(formatDurationMinutes(60)).toBe("1 hour");
    expect(formatDurationMinutes(180)).toBe("3 hours");
  });
});
