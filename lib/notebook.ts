// Server-only: instantiates the Prisma client at module scope. Never
// import this from a client component — use lib/notebookFormat.ts for the
// pure formatting/ordering helpers that are safe there.
import { Prisma, type NotebookEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { journalDateTitle } from "@/lib/notebookFormat";

export const NOTEBOOK_LIST_DEFAULT_LIMIT = 30;
export const NOTEBOOK_LIST_MAX_LIMIT = 100;

// Idempotent "the journal entry for this date" lookup, shared by the
// Today page / calendar day modal's "Write about this day" action and the
// notebook's own New Entry -> Journal flow. Safe against double
// submissions: a duplicate insert racing the @@unique([userId,
// journalDate]) constraint falls back to returning whichever row won
// rather than surfacing a 500. `title` is assumed already validated by the
// caller (or omitted, in which case journalDateTitle() supplies one).
export async function getOrCreateJournalEntry(
  userId: string,
  journalDate: string,
  title?: string
): Promise<{ entry: NotebookEntry; created: boolean }> {
  const existing = await prisma.notebookEntry.findFirst({ where: { userId, journalDate } });
  if (existing) return { entry: existing, created: false };

  const finalTitle = title?.trim() || journalDateTitle(journalDate);
  try {
    const entry = await prisma.notebookEntry.create({
      data: { userId, title: finalTitle, entryType: "journal", journalDate },
    });
    return { entry, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const race = await prisma.notebookEntry.findFirst({ where: { userId, journalDate } });
      if (race) return { entry: race, created: false };
    }
    throw err;
  }
}
