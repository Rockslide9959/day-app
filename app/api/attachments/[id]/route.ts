import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { isImageMimeType } from "@/lib/attachments";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findFirst({ where: { id, userId } });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Images render inline (thumbnails in AttachmentList, opening in a new tab);
  // everything else is served as a download. `?download=1` forces the download
  // path for images too, so the list can still offer "save" on a preview.
  const forceDownload = req.nextUrl.searchParams.get("download") === "1";
  const disposition =
    isImageMimeType(attachment.mimeType) && !forceDownload ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachment.fileName)}"`,
      "Content-Length": String(attachment.fileSize),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await prisma.attachment.deleteMany({ where: { id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
