import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { validateEntryType, validateJournalDate, validateNotebookTags, validateNotebookTitle } from "@/lib/validation";
import { getOrCreateJournalEntry, NOTEBOOK_LIST_DEFAULT_LIMIT, NOTEBOOK_LIST_MAX_LIMIT } from "@/lib/notebook";
import { toNotebookEntryPreview } from "@/lib/notebookFormat";
import { resolveContentUpdate } from "@/lib/richText";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") || "").trim();
  const type = params.get("type") || "all";
  const pinnedOnly = params.get("pinned") === "true";
  const sort = params.get("sort") || "updated";
  const limit = Math.min(
    Math.max(1, Number(params.get("limit")) || NOTEBOOK_LIST_DEFAULT_LIMIT),
    NOTEBOOK_LIST_MAX_LIMIT
  );
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const where: Prisma.NotebookEntryWhereInput = { userId };
  if (type === "journal" || type === "note") where.entryType = type;
  if (pinnedOnly) where.pinned = true;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.NotebookEntryOrderByWithRelationInput[] =
    sort === "newest"
      ? [{ createdAt: "desc" }]
      : sort === "oldest"
        ? [{ createdAt: "asc" }]
        : [{ updatedAt: "desc" }];

  const [entries, total] = await Promise.all([
    prisma.notebookEntry.findMany({ where, orderBy, skip: offset, take: limit }),
    prisma.notebookEntry.count({ where }),
  ]);

  return NextResponse.json({
    entries: entries.map(toNotebookEntryPreview),
    total,
    limit,
    offset,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted request body, shape checked field-by-field below
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const entryTypeError = validateEntryType(body.entryType);
  if (entryTypeError) return NextResponse.json({ error: entryTypeError }, { status: 400 });
  const entryType = body.entryType === "journal" ? "journal" : "note";

  const journalDate = entryType === "journal" ? (body.journalDate as string) : null;
  const journalDateError = validateJournalDate(entryType, journalDate);
  if (journalDateError) return NextResponse.json({ error: journalDateError }, { status: 400 });

  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (rawTitle) {
    const titleError = validateNotebookTitle(rawTitle);
    if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });
  }

  // A journal entry is created (or, per AGENTS.md's notebook spec,
  // returned unchanged if one already exists for that date) without
  // collecting content/tags upfront — the New Entry -> Journal flow only
  // asks for a date and an optional title, matching a note's normal
  // "start writing, autosave fills in the rest" flow.
  if (entryType === "journal") {
    const { entry, created } = await getOrCreateJournalEntry(userId, journalDate!, rawTitle || undefined);
    return NextResponse.json(entry, { status: created ? 201 : 200 });
  }

  const titleError = validateNotebookTitle(rawTitle);
  if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });

  const tagsError = validateNotebookTags(body.tags);
  if (tagsError) return NextResponse.json({ error: tagsError }, { status: 400 });

  const contentResult = resolveContentUpdate(body);
  if (!contentResult.ok) return NextResponse.json({ error: contentResult.error }, { status: 400 });

  const entry = await prisma.notebookEntry.create({
    data: {
      userId,
      title: rawTitle,
      content: contentResult.fields.content ?? "",
      contentFormat: contentResult.fields.contentFormat ?? "plain",
      // Prisma requires the Prisma.DbNull sentinel (not a plain JS null)
      // to set a nullable Json column to database NULL; when richContent
      // wasn't part of this create at all, omit the key entirely so the
      // column is simply left at its natural NULL rather than writing
      // either sentinel unnecessarily.
      ...(contentResult.fields.richContent !== undefined
        ? { richContent: contentResult.fields.richContent ?? Prisma.DbNull }
        : {}),
      entryType: "note",
      journalDate: null,
      tags: typeof body.tags === "string" ? body.tags : "",
      pinned: Boolean(body.pinned),
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
