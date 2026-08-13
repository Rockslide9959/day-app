"use client";

import { getWeekDates } from "@/lib/dates";
import { CalendarEvent } from "./types";
import { CategoryDef } from "@/lib/calendar/categories";
import TimeGrid from "./TimeGrid";

export default function WeekView({
  anchorDate,
  events,
  categories,
  onSelectSlot,
  onSelectEvent,
}: {
  anchorDate: string;
  events: CalendarEvent[];
  categories: CategoryDef[];
  onSelectSlot: (date: string, time: string) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const dates = getWeekDates(anchorDate);
  return (
    <TimeGrid
      dates={dates}
      events={events}
      categories={categories}
      onSelectSlot={onSelectSlot}
      onSelectEvent={onSelectEvent}
    />
  );
}
