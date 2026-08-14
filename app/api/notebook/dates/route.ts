import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { isValidDateStr } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Metadata-only lookup for the calendar's month-view journal indicator:
// which dates in [from, to] have a journal entry. Never returns titles or
// content — just the dates — so the calendar range endpoint can fetch this
// in one request without exposing entry text.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isValidDateStr(from) || !isValidDateStr(to)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }

  const entries = await prisma.notebookEntry.findMany({
    where: { userId, entryType: "journal", journalDate: { gte: from, lte: to } },
    select: { journalDate: true },
  });
  return NextResponse.json(entries.map((e) => e.journalDate));
}
