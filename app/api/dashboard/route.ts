import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { todayStr } from "@/lib/dates";
import { isValidDateStr } from "@/lib/validation";
import { loadDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

// Aggregate read for the "Today" page. `date` is the client's local
// calendar date (YYYY-MM-DD) so the day boundary matches the device, the
// same contract as /api/todos and /api/notebook/daily.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") || todayStr();
  if (!isValidDateStr(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const data = await loadDashboardData(userId, date);
  return NextResponse.json(data);
}
