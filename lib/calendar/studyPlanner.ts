// How many study/work hours are still unscheduled for an assessment,
// given hours already booked (e.g. existing "Study" events tagged with
// the same subject).
export function remainingStudyHours(estimatedHours: number, scheduledHours: number): number {
  return Math.max(0, Math.round((estimatedHours - scheduledHours) * 10) / 10);
}
