export function nextOccurrence(dueAt: Date, recurrence: string): Date | null {
  const next = new Date(dueAt);
  if (recurrence === "daily") {
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (recurrence === "weekly") {
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (recurrence === "weekdays") {
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() === 0 || next.getDay() === 6);
    return next;
  }
  return null;
}
