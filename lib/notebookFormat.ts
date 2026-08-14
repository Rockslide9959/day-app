// Pure notebook formatting/ordering helpers — safe to import from both
// server code (API routes) and client components. No Prisma client import
// here: that lives in lib/notebook.ts, which is server-only (it
// instantiates PrismaClient at module scope, so it must never be pulled
// into a client bundle).
import type { NotebookEntry } from "@prisma/client";
import { dateStrToDate } from "@/lib/dates";

export const NOTEBOOK_CONTENT_PREVIEW_LENGTH = 140;

// Collapse to single-line plain text and truncate — previews are for
// scanning the list, never a place to render user HTML or preserve
// formatting.
export function buildContentPreview(
  content: string,
  maxLength: number = NOTEBOOK_CONTENT_PREVIEW_LENGTH
): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength).trimEnd()}…`;
}

export type NotebookEntryPreview = {
  id: string;
  title: string;
  entryType: string;
  journalDate: string | null;
  tags: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  preview: string;
};

export function toNotebookEntryPreview(entry: NotebookEntry): NotebookEntryPreview {
  return {
    id: entry.id,
    title: entry.title,
    entryType: entry.entryType,
    journalDate: entry.journalDate,
    tags: entry.tags,
    pinned: entry.pinned,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    preview: buildContentPreview(entry.content),
  };
}

// Default title for a freshly-created journal entry, e.g.
// "Thursday, August 20, 2026" — deliberately not "Today"/"Tomorrow" (as
// lib/dates.ts's formatDateLabel uses for display) since a stored title
// needs to stay meaningful when read back on a later day. Pinned to a
// fixed locale (rather than the runtime default, as lib/dates.ts's
// display-only helpers use) because this one runs on both the server
// (creating the entry) and the client (re-deriving the same label for the
// "Journal date" badge) — those two runtimes can have different default
// locales, which would otherwise make a freshly-created title's format
// disagree with the badge shown right next to it.
export function journalDateTitle(journalDate: string): string {
  return dateStrToDate(journalDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Deterministic ordering key for Previous/Next navigation across the
// combined journal+notes history: a journal entry sorts by its
// journalDate, a note by its createdAt — see AGENTS.md's notebook spec.
export function notebookOrderKey(entry: { journalDate: string | null; createdAt: Date }): string {
  return entry.journalDate ?? entry.createdAt.toISOString();
}
