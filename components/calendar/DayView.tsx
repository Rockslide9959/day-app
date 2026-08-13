"use client";

import { CalendarEvent } from "./types";
import { CategoryDef } from "@/lib/calendar/categories";
import TimeGrid from "./TimeGrid";

export default function DayView({
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
  return (
    <TimeGrid
      dates={[anchorDate]}
      events={events}
      categories={categories}
      onSelectSlot={onSelectSlot}
      onSelectEvent={onSelectEvent}
    />
  );
}
