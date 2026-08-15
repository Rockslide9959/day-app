"use client";

import { EditorContent, type Editor } from "@tiptap/react";

// Presentational writing surface — the Editor instance itself is owned by
// useNotebookEditor() one level up (see app/notebook/[id]/page.tsx) so the
// same instance can also be shared with EditorToolbar for reactive
// active-state and undo/redo availability.
export default function RichTextEditor({
  editor,
  entryId,
}: {
  editor: Editor | null;
  // Used to give the writing area a stable, entry-specific id for
  // accessibility anchoring (e.g. aria-describedby elsewhere on the page).
  entryId?: string;
}) {
  return (
    <div
      id={entryId ? `notebook-editor-${entryId}` : undefined}
      className="notebook-editor min-h-[50vh] w-full flex-1 overflow-x-hidden rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:min-h-[58vh] dark:border-zinc-700 dark:bg-zinc-900"
    >
      <EditorContent editor={editor} />
    </div>
  );
}
