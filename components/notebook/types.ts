import type { TiptapDocument } from "@/lib/richText";

export type { TiptapDocument };

export type NotebookEntryPreview = {
  id: string;
  title: string;
  entryType: string;
  journalDate: string | null;
  tags: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  preview: string;
};

export type NotebookEntryFull = {
  id: string;
  title: string;
  content: string;
  contentFormat: "plain" | "tiptap-json";
  richContent: TiptapDocument | null;
  entryType: string;
  journalDate: string | null;
  tags: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  neighbors?: { prevId: string | null; nextId: string | null };
};
