import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/dates";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") || todayStr();
  const todos = await prisma.todo.findMany({
    where: { userId, date },
    orderBy: [{ completed: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, date } = body;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const todo = await prisma.todo.create({
    data: { userId, title, date: date || todayStr() },
  });
  return NextResponse.json(todo, { status: 201 });
}
