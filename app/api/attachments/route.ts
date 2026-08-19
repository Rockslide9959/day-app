import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_ATTACHMENT_BYTES, isAttachmentLinkedType, userOwnsLinkedItem } from "@/lib/attachments";

export const dynamic = "force-dynamic";

// Metadata only — never the file bytes, so listing an item's attachments
// stays cheap even with several files attached.
const LIST_SELECT = {
  id: true,
  linkedType: true,
  linkedId: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const linkedType = req.nextUrl.searchParams.get("linkedType");
  const linkedId = req.nextUrl.searchParams.get("linkedId");
  if (!isAttachmentLinkedType(linkedType) || !linkedId) {
    return NextResponse.json({ error: "linkedType must be 'todo' or 'schedule', and linkedId is required" }, { status: 400 });
  }

  const attachments = await prisma.attachment.findMany({
    where: { userId, linkedType, linkedId },
    select: LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const linkedType = form.get("linkedType");
  const linkedId = form.get("linkedId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!isAttachmentLinkedType(linkedType) || typeof linkedId !== "string" || !linkedId) {
    return NextResponse.json({ error: "linkedType must be 'todo' or 'schedule', and linkedId is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: `File exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit` }, { status: 400 });
  }
  if (!(await userOwnsLinkedItem(userId, linkedType, linkedId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const attachment = await prisma.attachment.create({
    data: {
      userId,
      linkedType,
      linkedId,
      fileName: file.name || "file",
      mimeType: file.type || "application/octet-stream",
      fileSize: buffer.length,
      data: buffer,
    },
    select: LIST_SELECT,
  });

  return NextResponse.json(attachment, { status: 201 });
}
