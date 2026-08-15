// Pure localStorage recovery-draft helpers for the notebook entry editor
// (app/notebook/[id]/page.tsx) — split out so the format-compatibility
// logic (v2 rich-text drafts, older unversioned plain drafts, malformed
// JSON) is directly unit-testable without rendering the editor page.
import { TiptapDocument } from "@/lib/richText";

export type NotebookDraftInput = {
  title: string;
  content: string;
  contentFormat: "plain" | "tiptap-json";
  richContent: TiptapDocument;
  tags: string;
  pinned: boolean;
};

// v2 adds rich-text fields on top of the original (unversioned) shape:
// { title, content, tags, pinned, savedAt }. `version` is present only
// from v2 onward — its absence is exactly how a legacy draft is
// recognized on read.
export type LocalNotebookDraft = {
  version: 2;
  title: string;
  content: string;
  contentFormat: "plain" | "tiptap-json";
  richContent: TiptapDocument | null;
  tags: string;
  pinned: boolean;
  savedAt: string;
};

export function notebookDraftKey(id: string): string {
  return `day:notebook:draft:${id}`;
}

// Never throws — malformed/corrupted JSON in localStorage (a user editing
// it by hand, a half-written value from a crashed tab, a format from a
// future app version) is treated as "no usable draft" rather than
// crashing the page.
export function readLocalNotebookDraft(id: string): LocalNotebookDraft | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(notebookDraftKey(id));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.savedAt !== "string" || typeof p.title !== "string" || typeof p.content !== "string" || typeof p.tags !== "string") {
    return null;
  }

  if (p.version === 2) {
    const contentFormat = p.contentFormat === "tiptap-json" ? "tiptap-json" : "plain";
    return {
      version: 2,
      title: p.title,
      content: p.content,
      contentFormat,
      richContent: contentFormat === "tiptap-json" && p.richContent ? (p.richContent as TiptapDocument) : null,
      tags: p.tags,
      pinned: Boolean(p.pinned),
      savedAt: p.savedAt,
    };
  }

  // Pre-rich-text (unversioned) draft — plain content only. Still
  // recoverable: normalized into the same v2 shape with contentFormat
  // "plain" so the caller can convert it into an editor document.
  return {
    version: 2,
    title: p.title,
    content: p.content,
    contentFormat: "plain",
    richContent: null,
    tags: p.tags,
    pinned: Boolean(p.pinned),
    savedAt: p.savedAt,
  };
}

export function writeLocalNotebookDraft(id: string, draft: NotebookDraftInput): void {
  try {
    const payload: LocalNotebookDraft = {
      version: 2,
      title: draft.title,
      content: draft.content,
      contentFormat: draft.contentFormat,
      richContent: draft.contentFormat === "tiptap-json" ? draft.richContent : null,
      tags: draft.tags,
      pinned: draft.pinned,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(notebookDraftKey(id), JSON.stringify(payload));
  } catch {
    // Storage full/unavailable — local recovery is a nice-to-have, not required.
  }
}

export function clearLocalNotebookDraft(id: string): void {
  try {
    localStorage.removeItem(notebookDraftKey(id));
  } catch {
    // ignore
  }
}
