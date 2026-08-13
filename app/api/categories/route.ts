import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/calendar/categories";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const custom = await prisma.eventCategory.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } });
  const defaults = DEFAULT_CATEGORIES.map((c) => ({ id: null, name: c.name, colorHex: c.colorHex, custom: false }));
  return NextResponse.json([...defaults, ...custom.map((c) => ({ ...c, custom: true }))]);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, colorHex } = body;
  if (!name || !colorHex) {
    return NextResponse.json({ error: "name and colorHex are required" }, { status: 400 });
  }
  if (DEFAULT_CATEGORIES.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "That name is already a default category" }, { status: 400 });
  }
  try {
    const category = await prisma.eventCategory.create({ data: { userId, name, colorHex } });
    return NextResponse.json(category, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}
