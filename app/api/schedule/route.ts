import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();
  const items = await prisma.scheduleItem.findMany({
    where: { date },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, notes, date, startTime, endTime } = body;
  if (!title || !startTime || !endTime) {
    return NextResponse.json(
      { error: "title, startTime and endTime are required" },
      { status: 400 }
    );
  }
  const item = await prisma.scheduleItem.create({
    data: {
      title,
      notes: notes || null,
      date: date || todayStr(),
      startTime,
      endTime,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
