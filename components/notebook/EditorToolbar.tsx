"use client";

import { useEditorState, type Editor } from "@tiptap/react";

type ToolbarButton = {
  key: string;
  label: string;
  ariaLabel: string;
  isActive?: boolean;
  disabled?: boolean;
  onRun: () => void;
};

// Presentational toolbar — shares the single Editor instance created by
// useNotebookEditor() (see app/notebook/[id]/page.tsx) with RichTextEditor,
// so both stay in sync with the same document/selection. Active-state and
// undo/redo availability are read via useEditorState, Tiptap v3's
// recommended reactive-selector API — it only re-renders this toolbar
// when the selected values actually change (deep-equal), not on every
// keystroke.
export default function EditorToolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) return null;
      return {
        isParagraph: e.isActive("paragraph"),
        isH1: e.isActive("heading", { level: 1 }),
        isH2: e.isActive("heading", { level: 2 }),
        isBold: e.isActive("bold"),
        isUnderline: e.isActive("underline"),
        isBulletList: e.isActive("bulletList"),
        isOrderedList: e.isActive("orderedList"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  if (!editor || !state) {
    return <div className="mb-2 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800" aria-hidden />;
  }

  const buttons: ToolbarButton[] = [
    {
      key: "paragraph",
      label: "¶",
      ariaLabel: "Paragraph",
      isActive: state.isParagraph,
      onRun: () => editor.chain().focus().setParagraph().run(),
    },
    {
      key: "h1",
      label: "H1",
      ariaLabel: "Heading 1",
      isActive: state.isH1,
      onRun: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      key: "h2",
      label: "H2",
      ariaLabel: "Heading 2",
      isActive: state.isH2,
      onRun: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "bold",
      label: "B",
      ariaLabel: "Bold",
      isActive: state.isBold,
      onRun: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: "underline",
      label: "U",
      ariaLabel: "Underline",
      isActive: state.isUnderline,
      onRun: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      key: "bulletList",
      label: "• List",
      ariaLabel: "Bulleted list",
      isActive: state.isBulletList,
      onRun: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: "1. List",
      ariaLabel: "Numbered list",
      isActive: state.isOrderedList,
      onRun: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "undo",
      label: "↶",
      ariaLabel: "Undo",
      disabled: !state.canUndo,
      onRun: () => editor.chain().focus().undo().run(),
    },
    {
      key: "redo",
      label: "↷",
      ariaLabel: "Redo",
      disabled: !state.canRedo,
      onRun: () => editor.chain().focus().redo().run(),
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="mb-2 flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:bg-zinc-800"
    >
      {buttons.map((btn) => (
        <button
          key={btn.key}
          type="button"
          disabled={btn.disabled}
          aria-label={btn.ariaLabel}
          aria-pressed={btn.isActive ?? false}
          title={btn.ariaLabel}
          // Prevent the button's own mousedown from stealing focus/collapsing
          // the editor's text selection before the click runs the command.
          onMouseDown={(e) => e.preventDefault()}
          onClick={btn.onRun}
          className={`flex h-9 min-w-[2.5rem] shrink-0 items-center justify-center rounded-lg px-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
            btn.isActive
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
              : "text-zinc-500 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-700/60"
          }`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
