import { prisma } from "@/lib/prisma";
import { sendPush, isPushConfigured } from "@/lib/webpush";
import { addDaysToDateStr } from "@/lib/dates";
import { resolveTimeZone, zonedTodayStr } from "@/lib/timezone";
import {
  candidateOccurrenceDates,
  computeReminderInstant,
  isOccurrenceCompleted,
  reminderNotificationPayload,
  CATCHUP_WINDOW_MINUTES,
  MAX_DELIVERY_ATTEMPTS,
} from "@/lib/calendar/reminders";

export type ScheduleReminderResult = {
  due: number;
  sent: number;
  retries: number;
  skippedCompleted: number;
};

const EMPTY_RESULT: ScheduleReminderResult = { due: 0, sent: 0, retries: 0, skippedCompleted: 0 };

// A "sending" row older than this is assumed to belong to a crashed/hung
// invocation rather than a genuinely in-flight one, and becomes retryable
// again — bounds how long a stuck claim can block a device's reminder.
const STALE_CLAIM_MINUTES = 5;

// Scans due ScheduleItem reminders and delivers them via the existing push
// stack (lib/webpush.ts), reusing lib/calendar/recurrence.ts for occurrence
// expansion. Mirrors the shape of the Reminder/Timer sweep in
// app/api/cron/tick/route.ts but is kept separate so that code (already
// working in production) never has to change.
//
// Two-phase per tick:
//  1. Find occurrences newly due (within the catch-up window) and ensure a
//     ScheduleReminderDelivery row exists per owner device — an `upsert`
//     against the (item, occurrence, device) unique constraint, so calling
//     this repeatedly never creates duplicates.
//  2. Attempt delivery for every outstanding row (freshly created above, or
//     left over from a previous tick's transient failure), claiming each
//     one first (status -> "sending") so two overlapping invocations can't
//     both deliver the same row.
export async function processScheduleReminders(now: Date): Promise<ScheduleReminderResult> {
  if (!isPushConfigured()) return EMPTY_RESULT;

  const result: ScheduleReminderResult = { due: 0, sent: 0, retries: 0, skippedCompleted: 0 };

  // Generous ±3-day prefilter on the DB query, anchored to the passed-in
  // `now` (never real wall-clock time, so this stays deterministic under
  // fixed-clock tests) — exact timing math happens below per item, in that
  // item's own resolved timezone.
  const nowDateStr = now.toISOString().slice(0, 10);
  const windowFrom = addDaysToDateStr(nowDateStr, -3);
  const windowTo = addDaysToDateStr(nowDateStr, 3);

  const items = await prisma.scheduleItem.findMany({
    where: {
      reminderMinutesBefore: { not: null },
      OR: [
        { recurrence: "none", date: { gte: windowFrom, lte: windowTo } },
        { NOT: { recurrence: "none" } },
      ],
    },
  });

  const subscriptionsByUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
  async function subscriptionsFor(userId: string) {
    let subs = subscriptionsByUser.get(userId);
    if (!subs) {
      subs = await prisma.pushSubscription.findMany({ where: { userId } });
      subscriptionsByUser.set(userId, subs);
    }
    return subs;
  }

  for (const item of items) {
    const timeZone = resolveTimeZone(item.timeZone);
    const localToday = zonedTodayStr(timeZone, now);
    const candidates = candidateOccurrenceDates(item, localToday);

    for (const occurrenceDate of candidates) {
      if (isOccurrenceCompleted(item, occurrenceDate)) {
        result.skippedCompleted++;
        continue;
      }

      const reminderAt = computeReminderInstant(item, occurrenceDate, timeZone);
      const msSinceDue = now.getTime() - reminderAt.getTime();
      if (msSinceDue < 0 || msSinceDue > CATCHUP_WINDOW_MINUTES * 60_000) continue;

      result.due++;
      const subscriptions = await subscriptionsFor(item.userId);
      for (const sub of subscriptions) {
        await prisma.scheduleReminderDelivery.upsert({
          where: {
            scheduleItemId_occurrenceDate_pushEndpoint: {
              scheduleItemId: item.id,
              occurrenceDate,
              pushEndpoint: sub.endpoint,
            },
          },
          update: {},
          create: {
            scheduleItemId: item.id,
            occurrenceDate,
            reminderAt,
            pushEndpoint: sub.endpoint,
            status: "pending",
            attempts: 0,
          },
        });
      }
    }
  }

  const staleClaimBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000);
  const deliverable = await prisma.scheduleReminderDelivery.findMany({
    where: {
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
      OR: [{ status: "pending" }, { status: "sending", lastAttemptAt: { lt: staleClaimBefore } }],
    },
    include: { scheduleItem: true },
  });

  for (const delivery of deliverable) {
    const claimed = await prisma.scheduleReminderDelivery.updateMany({
      where: { id: delivery.id, status: delivery.status },
      data: { status: "sending", lastAttemptAt: now },
    });
    if (claimed.count === 0) continue; // another concurrent tick already has this row

    const item = delivery.scheduleItem;
    if (!item) continue; // defensive only — cascade delete removes these together

    if (delivery.attempts > 0) result.retries++;

    const subscription = await prisma.pushSubscription.findFirst({
      where: { endpoint: delivery.pushEndpoint, userId: item.userId },
    });
    if (!subscription) {
      // Device no longer subscribed — nothing to send to, stop retrying.
      await prisma.scheduleReminderDelivery.update({
        where: { id: delivery.id },
        data: { status: "failed", attempts: { increment: 1 }, lastAttemptAt: now },
      });
      continue;
    }

    const payload = reminderNotificationPayload(item, delivery.occurrenceDate);
    try {
      await sendPush(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload
      );
      await prisma.scheduleReminderDelivery.update({
        where: { id: delivery.id },
        data: { status: "sent", sentAt: now, lastAttemptAt: now, attempts: { increment: 1 } },
      });
      result.sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
        await prisma.scheduleReminderDelivery.update({
          where: { id: delivery.id },
          data: { status: "failed", attempts: { increment: 1 }, lastAttemptAt: now },
        });
      } else {
        console.error("push send failed", { userId: item.userId, statusCode, body: (err as { body?: string })?.body, message: (err as Error)?.message });
        // Transient failure — leave it retryable for the next tick.
        await prisma.scheduleReminderDelivery.update({
          where: { id: delivery.id },
          data: { status: "pending", attempts: { increment: 1 }, lastAttemptAt: now },
        });
      }
    }
  }

  return result;
}
