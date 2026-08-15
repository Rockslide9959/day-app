// Pure, framework-free notebook rich-text helpers — safe to import from
// both server code (API route validation) and client components (the
// editor, autosave draft comparison). No Tiptap/ProseMirror runtime
// import here on purpose: everything below is a hand-rolled JSON
// shape/validator that mirrors exactly what the configured editor (see
// components/notebook/useNotebookEditor.ts) produces, verified directly
// against the installed prosemirror-model's Node/Mark toJSON() — not
// re-derived by round-tripping through a live editor instance, so this
// stays usable on the server without a DOM.
import { validateNotebookContent } from "@/lib/validation";
//
// Serialization rules this file depends on (verified against
// node_modules/prosemirror-model/dist/index.js and the relevant
// @tiptap/extension-* packages, not assumed from memory):
//   - A node's `attrs` key is present iff its node type declares at least
//     one attr (regardless of whether the value is the default) — so
//     `heading` always has `attrs.level`, `paragraph`/`text`/`hardBreak`
//     never have `attrs` at all (none of them declare any).
//   - A node's `content` key is present iff it has at least one child.
//   - A text node's `marks` key is present iff it has at least one mark.

export type TiptapMarkType = "bold" | "underline";
export type TiptapMark = { type: TiptapMarkType };

export type TiptapTextNode = { type: "text"; text: string; marks?: TiptapMark[] };
export type TiptapHardBreakNode = { type: "hardBreak" };
export type TiptapInlineNode = TiptapTextNode | TiptapHardBreakNode;

export type TiptapParagraphNode = { type: "paragraph"; content?: TiptapInlineNode[] };
export type TiptapHeadingNode = { type: "heading"; attrs: { level: 1 | 2 }; content?: TiptapInlineNode[] };

export type TiptapListItemChild = TiptapParagraphNode | TiptapHeadingNode | TiptapBulletListNode | TiptapOrderedListNode;
export type TiptapListItemNode = { type: "listItem"; content: TiptapListItemChild[] };
export type TiptapBulletListNode = { type: "bulletList"; content: TiptapListItemNode[] };
export type TiptapOrderedListNode = {
  type: "orderedList";
  attrs?: { start?: number; type?: "1" | "a" | "A" | "i" | "I" | null };
  content: TiptapListItemNode[];
};

export type TiptapBlockNode = TiptapParagraphNode | TiptapHeadingNode | TiptapBulletListNode | TiptapOrderedListNode;
export type TiptapDocument = { type: "doc"; content: TiptapBlockNode[] };

export const EMPTY_TIPTAP_DOC: TiptapDocument = { type: "doc", content: [{ type: "paragraph" }] };

export const TIPTAP_JSON_MAX_LENGTH = 2_000_000;
export const TIPTAP_MAX_DEPTH = 20;

// ---------------------------------------------------------------------
// Plain text -> Tiptap document (for displaying legacy contentFormat:
// "plain" entries in the rich editor without ever parsing the old text
// as HTML/markdown — every character lands verbatim inside a `text`
// node's `text` string, so "<script>", "&amp;", etc. stay inert literal
// text, never markup).
// ---------------------------------------------------------------------

// Blank-line-separated blocks become paragraphs; a single `\n` within a
// block becomes a hardBreak, preserving the line break without exploding
// one paragraph per line. Produces the exact JSON shape the live editor
// would report for the same starting content (see the file banner) so
// seeding the autosave baseline from this never looks like an edit.
export function plainTextToTiptapDoc(text: string): TiptapDocument {
  if (!text) return EMPTY_TIPTAP_DOC;

  const blocks = text.split(/\n[ \t]*\n/);
  const content: TiptapParagraphNode[] = blocks.map((block) => {
    const lines = block.split("\n");
    const inline: TiptapInlineNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: "hardBreak" });
      if (line.length > 0) inline.push({ type: "text", text: line });
    });
    return inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" };
  });

  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

// ---------------------------------------------------------------------
// Tiptap document -> plain text (server-derived source of truth for the
// searchable `content` column and list/dashboard previews).
// ---------------------------------------------------------------------

function inlineToText(nodes: TiptapInlineNode[] | undefined): string {
  if (!nodes) return "";
  return nodes.map((n) => (n.type === "text" ? n.text : "\n")).join("");
}

function blockToText(node: TiptapBlockNode): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return inlineToText(node.content);
    case "bulletList":
    case "orderedList":
      return node.content.map(listItemToText).join("\n");
  }
}

function listItemToText(item: TiptapListItemNode): string {
  return item.content.map(blockToText).join("\n");
}

export function deriveDocPlainText(doc: TiptapDocument): string {
  const text = (doc.content || []).map(blockToText).join("\n\n");
  // Collapse runs of 3+ newlines (e.g. from consecutive empty paragraphs)
  // down to a normal paragraph gap, and trim the ends.
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function isEmptyTiptapDoc(doc: TiptapDocument): boolean {
  return deriveDocPlainText(doc).length === 0;
}

// ---------------------------------------------------------------------
// Server-side validator. Treats all incoming JSON as untrusted: only the
// node types, marks and attributes the configured editor can actually
// produce are permitted (see components/notebook/useNotebookEditor.ts —
// StarterKit with blockquote/code/codeBlock/horizontalRule/italic/
// strike/link disabled, heading limited to [1, 2], plus Placeholder).
// ---------------------------------------------------------------------

export type TiptapValidationResult =
  | { ok: true; doc: TiptapDocument }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(obj: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(obj).every((k) => (allowed as string[]).includes(k));
}

const ALLOWED_MARK_TYPES: readonly TiptapMarkType[] = ["bold", "underline"];
const ORDERED_LIST_TYPE_VALUES = new Set(["1", "a", "A", "i", "I"]);

function validateMarks(marks: unknown, path: string): string | null {
  if (marks === undefined) return null;
  if (!Array.isArray(marks)) return `${path}.marks must be an array`;
  for (const mark of marks) {
    if (!isPlainObject(mark)) return `${path} has a malformed mark`;
    if (!ALLOWED_MARK_TYPES.includes(mark.type as TiptapMarkType)) {
      return `${path} has an unsupported mark`;
    }
    if (!hasOnlyKeys(mark, ["type"])) return `${path} mark has unexpected attributes`;
  }
  return null;
}

function validateInlineNode(node: unknown, path: string): string | null {
  if (!isPlainObject(node)) return `${path} is malformed`;
  if (node.type === "text") {
    if (typeof node.text !== "string" || node.text.length === 0) {
      return `${path} text node must have non-empty text`;
    }
    if (!hasOnlyKeys(node, ["type", "text", "marks"])) return `${path} text node has unexpected attributes`;
    return validateMarks(node.marks, path);
  }
  if (node.type === "hardBreak") {
    if (!hasOnlyKeys(node, ["type"])) return `${path} hardBreak has unexpected attributes`;
    return null;
  }
  return `${path} has an unsupported node type`;
}

function validateInlineContent(content: unknown, path: string): string | null {
  if (content === undefined) return null;
  if (!Array.isArray(content)) return `${path}.content must be an array`;
  for (let i = 0; i < content.length; i++) {
    const err = validateInlineNode(content[i], `${path}.content[${i}]`);
    if (err) return err;
  }
  return null;
}

function validateOrderedListAttrs(attrs: unknown, path: string): string | null {
  if (attrs === undefined) return null;
  if (!isPlainObject(attrs)) return `${path} attrs must be an object`;
  if (!hasOnlyKeys(attrs, ["start", "type"])) return `${path} has unexpected attrs`;
  if (attrs.start !== undefined) {
    if (!Number.isInteger(attrs.start) || (attrs.start as number) < 1 || (attrs.start as number) > 9999) {
      return `${path} start attr is invalid`;
    }
  }
  if (attrs.type !== undefined && attrs.type !== null && !ORDERED_LIST_TYPE_VALUES.has(attrs.type as string)) {
    return `${path} type attr is invalid`;
  }
  return null;
}

function validateBlockNode(node: unknown, path: string, depth: number): string | null {
  if (depth > TIPTAP_MAX_DEPTH) return "document is nested too deeply";
  if (!isPlainObject(node)) return `${path} is malformed`;

  if (node.type === "paragraph") {
    if (!hasOnlyKeys(node, ["type", "content"])) return `${path} paragraph has unexpected attributes`;
    return validateInlineContent(node.content, path);
  }

  if (node.type === "heading") {
    if (!hasOnlyKeys(node, ["type", "attrs", "content"])) return `${path} heading has unexpected attributes`;
    if (!isPlainObject(node.attrs) || !hasOnlyKeys(node.attrs, ["level"])) {
      return `${path} heading is missing a valid level`;
    }
    if (node.attrs.level !== 1 && node.attrs.level !== 2) {
      return `${path} heading level must be 1 or 2`;
    }
    return validateInlineContent(node.content, path);
  }

  if (node.type === "bulletList" || node.type === "orderedList") {
    const allowedKeys = node.type === "orderedList" ? ["type", "attrs", "content"] : ["type", "content"];
    if (!hasOnlyKeys(node, allowedKeys)) return `${path} ${node.type} has unexpected attributes`;
    if (node.type === "orderedList") {
      const err = validateOrderedListAttrs(node.attrs, path);
      if (err) return err;
    }
    if (!Array.isArray(node.content) || node.content.length === 0) {
      return `${path} ${node.type} must contain at least one list item`;
    }
    for (let i = 0; i < node.content.length; i++) {
      const err = validateListItem(node.content[i], `${path}.content[${i}]`, depth + 1);
      if (err) return err;
    }
    return null;
  }

  return `${path} has an unsupported node type`;
}

function validateListItem(node: unknown, path: string, depth: number): string | null {
  if (depth > TIPTAP_MAX_DEPTH) return "document is nested too deeply";
  if (!isPlainObject(node) || node.type !== "listItem") return `${path} must be a listItem`;
  if (!hasOnlyKeys(node, ["type", "content"])) return `${path} listItem has unexpected attributes`;
  if (!Array.isArray(node.content) || node.content.length === 0) return `${path} listItem must not be empty`;

  const first = node.content[0];
  if (!isPlainObject(first) || first.type !== "paragraph") {
    return `${path} listItem must start with a paragraph`;
  }
  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    if (
      !isPlainObject(child) ||
      (child.type !== "paragraph" && child.type !== "heading" && child.type !== "bulletList" && child.type !== "orderedList")
    ) {
      return `${path}.content[${i}] is not a supported list item child`;
    }
    const err = validateBlockNode(child, `${path}.content[${i}]`, depth + 1);
    if (err) return err;
  }
  return null;
}

export function validateTiptapDocument(value: unknown): TiptapValidationResult {
  let size: number;
  try {
    size = JSON.stringify(value)?.length ?? 0;
  } catch {
    return { ok: false, error: "richContent must be valid JSON" };
  }
  if (size > TIPTAP_JSON_MAX_LENGTH) {
    return { ok: false, error: `richContent must be ${TIPTAP_JSON_MAX_LENGTH.toLocaleString()} characters or fewer when serialized` };
  }

  if (!isPlainObject(value) || value.type !== "doc") {
    return { ok: false, error: "richContent must be a Tiptap document" };
  }
  if (!hasOnlyKeys(value, ["type", "content"])) {
    return { ok: false, error: "richContent has unexpected top-level attributes" };
  }
  if (value.content !== undefined && !Array.isArray(value.content)) {
    return { ok: false, error: "richContent.content must be an array" };
  }

  const content = (value.content ?? []) as unknown[];
  for (let i = 0; i < content.length; i++) {
    const err = validateBlockNode(content[i], `doc.content[${i}]`, 1);
    if (err) return { ok: false, error: err };
  }

  return { ok: true, doc: { type: "doc", content: content as TiptapBlockNode[] } };
}

// ---------------------------------------------------------------------
// Shared create/update resolution — used by both POST /api/notebook and
// PATCH /api/notebook/[id] so the two routes agree exactly on how the
// content/contentFormat/richContent trio is validated and derived.
// Additive: only returns the fields the request actually touched, so an
// old-style `{ content: "..." }` PATCH (no richContent, no contentFormat)
// updates just `content` and leaves contentFormat/richContent alone —
// existing plain-text behavior is unchanged.
// ---------------------------------------------------------------------

export type ResolvedNotebookContent = {
  content: string;
  contentFormat: "plain" | "tiptap-json";
  richContent: TiptapDocument | null;
};

export type ResolveContentUpdateResult =
  | { ok: true; fields: Partial<ResolvedNotebookContent> }
  | { ok: false; error: string };

export function resolveContentUpdate(body: Record<string, unknown>): ResolveContentUpdateResult {
  const richContentPresent = Object.prototype.hasOwnProperty.call(body, "richContent");
  const contentFormatPresent = typeof body.contentFormat === "string";

  if (contentFormatPresent && body.contentFormat !== "plain" && body.contentFormat !== "tiptap-json") {
    return { ok: false, error: 'contentFormat must be "plain" or "tiptap-json"' };
  }

  // A rich-text save is authoritative over any plain `content` string in
  // the same request — the derived plain text always wins, never a
  // client-supplied one, per the notebook rich-text spec.
  if (richContentPresent) {
    if (contentFormatPresent && body.contentFormat !== "tiptap-json") {
      return { ok: false, error: 'contentFormat must be "tiptap-json" when richContent is provided' };
    }
    const validation = validateTiptapDocument(body.richContent);
    if (!validation.ok) return { ok: false, error: validation.error };
    const derivedText = deriveDocPlainText(validation.doc);
    const contentError = validateNotebookContent(derivedText);
    if (contentError) return { ok: false, error: contentError };
    return {
      ok: true,
      fields: { content: derivedText, contentFormat: "tiptap-json", richContent: validation.doc },
    };
  }

  if (contentFormatPresent && body.contentFormat === "tiptap-json") {
    return { ok: false, error: 'richContent is required when contentFormat is "tiptap-json"' };
  }

  const fields: Partial<ResolvedNotebookContent> = {};
  if (typeof body.content === "string") {
    const contentError = validateNotebookContent(body.content);
    if (contentError) return { ok: false, error: contentError };
    fields.content = body.content;
  }
  if (contentFormatPresent) {
    fields.contentFormat = "plain";
    fields.richContent = null;
  }
  return { ok: true, fields };
}
