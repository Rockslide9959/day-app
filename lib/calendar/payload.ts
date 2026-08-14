import type { EventDraft } from "@/components/calendar/EventModal";

// Shared by the Calendar and Schedule pages so create/edit payloads stay in
// sync — a task's date/startTime represent its due date/time rather than a
// start of a range, and are derived here rather than trusted verbatim from
// the draft (the API re-derives them again server-side as a second line of
// defense).
export function draftToPayload(draft: EventDraft) {
  const base = {
    title: draft.title.trim(),
    notes: draft.notes.trim() || null,
    category: draft.category || null,
    priority: draft.priority,
    reminderMinutesBefore:
      draft.reminderMinutesBefore === "" ? null : Number(draft.reminderMinutesBefore),
    recurrence: draft.recurrence,
    recurrenceDays: draft.recurrenceDays.length > 0 ? draft.recurrenceDays.join(",") : null,
    recurrenceEndDate: draft.recurrenceEndDate || null,
    subject: draft.subject.trim() || null,
    estimatedHours: draft.estimatedHours === "" ? null : Number(draft.estimatedHours),
  };

  if (draft.itemType === "task") {
    return {
      ...base,
      itemType: "task" as const,
      date: draft.date,
      startTime: draft.hasDueTime ? draft.startTime : "00:00",
      endTime: draft.hasDueTime ? draft.startTime : "23:59",
      endDate: draft.date,
      allDay: !draft.hasDueTime,
      location: null,
    };
  }

  return {
    ...base,
    itemType: "event" as const,
    date: draft.date,
    startTime: draft.allDay ? "00:00" : draft.startTime,
    endTime: draft.allDay ? "23:59" : draft.endTime,
    endDate: draft.endDate || draft.date,
    allDay: draft.allDay,
    location: draft.location.trim() || null,
  };
}
