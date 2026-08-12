import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();
  const todos = await prisma.todo.findMany({
    where: { date },
    orderBy: [{ completed: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, date } = body;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const todo = await prisma.todo.create({
    data: { title, date: date || todayStr() },
  });
  return NextResponse.json(todo, { status: 201 });
}
