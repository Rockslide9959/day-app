"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { isAllowedLinkHref, normalizeLinkHref } from "@/lib/richText";

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
        isItalic: e.isActive("italic"),
        isStrike: e.isActive("strike"),
        isLink: e.isActive("link"),
        isBlockquote: e.isActive("blockquote"),
        isBulletList: e.isActive("bulletList"),
        isOrderedList: e.isActive("orderedList"),
        isAlignLeft: e.isActive({ textAlign: "left" }),
        isAlignCenter: e.isActive({ textAlign: "center" }),
        isAlignRight: e.isActive({ textAlign: "right" }),
        linkHref: e.getAttributes("link").href as string | undefined,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  // Prompts for a URL and applies/updates/removes the link mark on the
  // current selection. window.prompt is a deliberately low-tech choice
  // here — a full inline link-editing popover would be a lot more UI for
  // a feature that's meant to stay simple.
  function runLinkCommand(editor: Editor, currentHref: string | undefined) {
    const input = window.prompt(
      currentHref ? "Edit link URL (leave blank to remove)" : "Enter URL",
      currentHref ?? ""
    );
    if (input === null) return; // cancelled
    const trimmed = input.trim();
    // extendMarkRange only makes sense when editing an existing link — it
    // grows the selection to cover the whole link so the edit applies to
    // all of it, not just the word the cursor happened to be in. Calling
    // it with no link at the selection collapses whatever the user had
    // highlighted (nothing to "extend" to), so a brand-new link must be
    // applied to the selection exactly as the user left it.
    const chain = editor.chain().focus();
    if (currentHref) chain.extendMarkRange("link");
    if (trimmed === "") {
      chain.unsetLink().run();
      return;
    }
    const href = normalizeLinkHref(trimmed);
    if (!isAllowedLinkHref(href)) {
      window.alert("Enter a valid http(s) or mailto link.");
      return;
    }
    chain.setLink({ href }).run();
  }

  if (!editor || !state) {
    return <div className="mb-2 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 crimson:bg-crimson-raised" aria-hidden />;
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
      key: "italic",
      label: "I",
      ariaLabel: "Italic",
      isActive: state.isItalic,
      onRun: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: "strike",
      label: "S",
      ariaLabel: "Strikethrough",
      isActive: state.isStrike,
      onRun: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: "link",
      label: "Link",
      ariaLabel: "Link",
      isActive: state.isLink,
      onRun: () => runLinkCommand(editor, state.linkHref),
    },
    {
      key: "blockquote",
      label: "❝",
      ariaLabel: "Quote",
      isActive: state.isBlockquote,
      onRun: () => editor.chain().focus().toggleBlockquote().run(),
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
      key: "alignLeft",
      label: "Left",
      ariaLabel: "Align left",
      isActive: state.isAlignLeft,
      onRun: () => editor.chain().focus().setTextAlign("left").run(),
    },
    {
      key: "alignCenter",
      label: "Center",
      ariaLabel: "Align center",
      isActive: state.isAlignCenter,
      onRun: () => editor.chain().focus().setTextAlign("center").run(),
    },
    {
      key: "alignRight",
      label: "Right",
      ariaLabel: "Align right",
      isActive: state.isAlignRight,
      onRun: () => editor.chain().focus().setTextAlign("right").run(),
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
      className="mb-2 flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:bg-zinc-800 crimson:bg-crimson-raised"
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
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50 crimson:bg-crimson-surface crimson:text-crimson-text"
              : "text-zinc-500 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-700/60 crimson:text-crimson-text-secondary crimson:hover:bg-crimson-surface/60"
          }`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
