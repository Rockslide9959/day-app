import { dateStrToDate } from "@/lib/dates";

export type VisibilityCheckItem = {
  itemType: string;
  completed: boolean;
  date: string;
  startTime: string;
  allDay: boolean;
};

// The moment a task is actually "due", in local time — end of the due date
// when no due time was set, otherwise the due date at the due time. Built
// from y/m/d parts (never `new Date("YYYY-MM-DD")`, which parses as UTC and
// would shift the deadline onto the wrong local day).
export function taskDeadline(date: string, startTime: string, allDay: boolean): Date {
  const deadline = dateStrToDate(date);
  if (allDay) {
    deadline.setHours(23, 59, 59, 999);
    return deadline;
  }
  const [h, m] = startTime.split(":").map(Number);
  deadline.setHours(h, m, 0, 0);
  return deadline;
}

// The normal-visibility rule for calendar tasks: an incomplete task is
// always visible (even overdue); a completed task stays visible until its
// due moment passes, then disappears from normal views (without being
// deleted). Events are always visible — this rule only ever hides tasks.
export function isScheduleItemVisible(item: VisibilityCheckItem, now: Date = new Date()): boolean {
  if (item.itemType !== "task") return true;
  if (!item.completed) return true;
  return now < taskDeadline(item.date, item.startTime, item.allDay);
}
