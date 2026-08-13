import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json([]);

  const items = await prisma.scheduleItem.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ date: "desc" }],
    take: 50,
  });
  return NextResponse.json(items);
}
