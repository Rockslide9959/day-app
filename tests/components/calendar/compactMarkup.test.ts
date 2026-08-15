import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Compact calendar displays (month grid, week/day time grid, day agenda)
// must never render a checkbox glyph — task/event distinction comes from
// the dashed-vs-solid chip styling and accessible labels instead. This is
// a lightweight regression guard against a leading checkbox creeping back
// into a narrow chip and eating its title width.
const COMPACT_CALENDAR_FILES = [
  "components/calendar/MonthView.tsx",
  "components/calendar/TimeGrid.tsx",
  "components/calendar/DayAgendaModal.tsx",
  "components/calendar/CalendarItemChip.tsx",
];

describe("compact calendar displays", () => {
  it.each(COMPACT_CALENDAR_FILES)("%s renders no checkbox glyphs", (relativePath) => {
    const source = readFileSync(path.resolve(__dirname, "../../..", relativePath), "utf-8");
    expect(source).not.toContain("☐");
    expect(source).not.toContain("☑");
  });
});
