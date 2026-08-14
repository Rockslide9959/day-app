import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/dates";
import { getCurrentUserId } from "@/lib/auth";
import { isValidDateStr, validateNotebookTitle } from "@/lib/validation";
import { getOrCreateJournalEntry } from "@/lib/notebook";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") || todayStr();
  if (!isValidDateStr(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const entry = await prisma.notebookEntry.findFirst({ where: { userId, journalDate: date } });
  return NextResponse.json(entry);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const date = typeof body.date === "string" ? body.date : todayStr();
  if (!isValidDateStr(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (rawTitle) {
    const titleError = validateNotebookTitle(rawTitle);
    if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });
  }

  const { entry, created } = await getOrCreateJournalEntry(userId, date, rawTitle || undefined);
  return NextResponse.json(entry, { status: created ? 201 : 200 });
}
