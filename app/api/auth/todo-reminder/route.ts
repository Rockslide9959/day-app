import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { isValidTimeStr } from "@/lib/validation";
import { isValidTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const data: { todoReminderEnabled?: boolean; todoReminderTime?: string; todoReminderTimeZone?: string } = {};

  if (body?.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    data.todoReminderEnabled = body.enabled;
  }

  if (body?.time !== undefined) {
    if (!isValidTimeStr(body.time)) {
      return NextResponse.json({ error: "time must be in HH:MM 24-hour format" }, { status: 400 });
    }
    data.todoReminderTime = body.time;
  }

  // Captured from the browser whenever the time is changed, so the cron
  // sweep (lib/todoReminderCron.ts) resolves "HH:MM" against the zone the
  // user actually meant rather than the fallback default.
  if (body?.timeZone !== undefined) {
    if (!isValidTimeZone(body.timeZone)) {
      return NextResponse.json({ error: "timeZone must be a valid IANA time zone" }, { status: 400 });
    }
    data.todoReminderTimeZone = body.timeZone;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { todoReminderEnabled: true, todoReminderTime: true, todoReminderTimeZone: true },
  });

  return NextResponse.json(user);
}
