import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { validateEntryType, validateJournalDate, validateNotebookTags, validateNotebookTitle } from "@/lib/validation";
import { notebookOrderKey } from "@/lib/notebookFormat";
import { resolveContentUpdate } from "@/lib/richText";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.notebookEntry.findFirst({ where: { id, userId } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Previous/Next across the whole notebook history: only id/entryType/
  // journalDate/createdAt are pulled for every entry (never content), then
  // sorted in memory by the shared journalDate-or-createdAt key — cheap
  // even for a large personal notebook, and avoids a second round trip per
  // navigation click.
  const all = await prisma.notebookEntry.findMany({
    where: { userId },
    select: { id: true, entryType: true, journalDate: true, createdAt: true },
  });
  all.sort((a, b) => notebookOrderKey(a).localeCompare(notebookOrderKey(b)));
  const index = all.findIndex((e) => e.id === id);
  const prevId = index > 0 ? all[index - 1].id : null;
  const nextId = index >= 0 && index < all.length - 1 ? all[index + 1].id : null;

  return NextResponse.json({ ...entry, neighbors: { prevId, nextId } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted request body, shape checked field-by-field below
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    const titleError = validateNotebookTitle(title);
    if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });
    data.title = title;
  }

  // Never logs body.content/body.richContent — validation errors below
  // are structural ("richContent must be a Tiptap document", etc.), never
  // an echo of the private writing itself.
  const contentResult = resolveContentUpdate(body);
  if (!contentResult.ok) return NextResponse.json({ error: contentResult.error }, { status: 400 });
  Object.assign(data, contentResult.fields);
  // Prisma requires the Prisma.DbNull sentinel (not a plain JS null) to
  // set a nullable Json column to database NULL — see notes in
  // app/api/notebook/route.ts's POST handler.
  if (data.richContent === null) data.richContent = Prisma.DbNull;

  if (typeof body.tags === "string") {
    const tagsError = validateNotebookTags(body.tags);
    if (tagsError) return NextResponse.json({ error: tagsError }, { status: 400 });
    data.tags = body.tags;
  }

  if (typeof body.pinned === "boolean") data.pinned = body.pinned;

  // Only touch entryType/journalDate when the request explicitly asks to
  // change them — a plain autosave PATCH (title/content/tags/pinned) never
  // includes these keys, so a journal entry's date can't drift by accident.
  const entryTypeRequested = typeof body.entryType === "string";
  const journalDateRequested = Object.prototype.hasOwnProperty.call(body, "journalDate");

  if (entryTypeRequested) {
    const entryTypeError = validateEntryType(body.entryType);
    if (entryTypeError) return NextResponse.json({ error: entryTypeError }, { status: 400 });
  }

  if (entryTypeRequested || journalDateRequested) {
    const current = await prisma.notebookEntry.findFirst({ where: { id, userId } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextEntryType = entryTypeRequested ? body.entryType : current.entryType;
    const nextJournalDate: string | null =
      nextEntryType === "note"
        ? null
        : journalDateRequested
          ? body.journalDate
          : current.journalDate;

    const journalDateError = validateJournalDate(nextEntryType, nextJournalDate);
    if (journalDateError) return NextResponse.json({ error: journalDateError }, { status: 400 });

    if (nextEntryType === "journal" && nextJournalDate !== current.journalDate) {
      const conflict = await prisma.notebookEntry.findFirst({
        where: { userId, journalDate: nextJournalDate, NOT: { id } },
      });
      if (conflict) {
        return NextResponse.json(
          {
            error: "You already have a journal entry for that date",
            conflictEntryId: conflict.id,
          },
          { status: 409 }
        );
      }
    }

    data.entryType = nextEntryType;
    data.journalDate = nextJournalDate;
  }

  const result = await prisma.notebookEntry.updateMany({ where: { id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const entry = await prisma.notebookEntry.findUnique({ where: { id } });
  return NextResponse.json(entry);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await prisma.notebookEntry.deleteMany({ where: { id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
