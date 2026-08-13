import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.scheduleItem.findFirst({ where: { id, userId } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shares = await prisma.eventShare.findMany({
    where: { scheduleItemId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(shares);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.scheduleItem.findFirst({ where: { id, userId } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const share = await prisma.eventShare.create({
    data: {
      scheduleItemId: id,
      createdByUserId: userId,
      token: randomBytes(18).toString("base64url"),
    },
  });

  return NextResponse.json(share, { status: 201 });
}
