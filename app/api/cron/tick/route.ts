import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush, isPushConfigured } from "@/lib/webpush";
import { nextOccurrence } from "@/lib/recurrence";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleTick(req);
}
export async function POST(req: NextRequest) {
  return handleTick(req);
}

async function handleTick(req: NextRequest) {
  const secret = (req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: { notified: false, completed: false, dueAt: { lte: now } },
  });

  if (due.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;
  for (const reminder of due) {
    // Each reminder only ever pushes to its own owner's devices — this
    // now serves multiple accounts, so there's no single global
    // subscription list anymore.
    const subscriptions = isPushConfigured()
      ? await prisma.pushSubscription.findMany({ where: { userId: reminder.userId } })
      : [];
    for (const sub of subscriptions) {
      try {
        await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          { title: reminder.title, body: reminder.notes || "Reminder", url: "/reminders" }
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }

    const next = nextOccurrence(reminder.dueAt, reminder.recurrence);
    if (next) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { dueAt: next, notified: false },
      });
    } else {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { notified: true },
      });
    }
  }

  return NextResponse.json({ sent, reminders: due.length });
}
