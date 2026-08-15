"use client";

import { useEffect } from "react";
import { useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { TiptapDocument } from "@/lib/richText";

// Single source of truth for which formatting this editor supports —
// StarterKit v3 already bundles Underline (unlike v2, where it needed a
// separate top-level extension), so it's configured here rather than
// added a second time, which would otherwise log a "duplicate extension"
// warning. Everything StarterKit provides beyond what lib/richText.ts's
// server-side validator allow-lists (blockquote, code, codeBlock,
// horizontalRule, italic, strike, link) is turned off so the editor can't
// produce content the server would reject.
function buildExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      italic: false,
      strike: false,
      link: false,
      heading: { levels: [1, 2] },
    }),
    Placeholder.configure({ placeholder: "Start writing…" }),
  ];
}

// Thin wrapper around @tiptap/react's useEditor with this app's fixed
// extension set. Created once per mounted component (empty deps array —
// matches the notebook editor page's own per-entry `key={id}` remount
// strategy, so a fresh Tiptap instance already comes for free on entry
// switches without also tearing down/rebuilding here on every render).
export function useNotebookEditor({
  content,
  onChange,
  editable = true,
}: {
  content: TiptapDocument;
  onChange: (doc: TiptapDocument) => void;
  editable?: boolean;
}): Editor | null {
  const editor = useEditor(
    {
      extensions: buildExtensions(),
      content: content as JSONContent,
      editable,
      // Safe here because this editor only ever mounts client-side, well
      // after the entry has already loaded (see app/notebook/[id]/page.tsx) —
      // it's never part of the server-rendered HTML Next.js hydrates
      // against, so there's no hydration-mismatch risk to guard against.
      immediatelyRender: true,
      editorProps: {
        attributes: {
          class: "notebook-editor-content",
          "aria-label": "Entry writing area",
        },
      },
      onUpdate: ({ editor: e }) => onChange(e.getJSON() as TiptapDocument),
    },
    []
  );

  useEffect(() => {
    // emitUpdate: false — toggling editability (e.g. while a local-draft
    // restore prompt is showing) isn't a document content change, so it
    // must not fire onUpdate. With the default (true), this synthetic
    // "update" on mount looked exactly like a real edit and triggered a
    // spurious autosave for every entry the moment it was opened.
    if (editor && !editor.isDestroyed) editor.setEditable(editable, false);
  }, [editor, editable]);

  return editor;
}
