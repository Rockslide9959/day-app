import { describe, expect, it } from "vitest";
import {
  deriveDocPlainText,
  isAllowedLinkHref,
  isEmptyTiptapDoc,
  normalizeLinkHref,
  plainTextToTiptapDoc,
  TIPTAP_MAX_DEPTH,
  validateTiptapDocument,
  type TiptapDocument,
} from "@/lib/richText";

describe("plainTextToTiptapDoc", () => {
  it("converts a single line into a document with one paragraph", () => {
    const doc = plainTextToTiptapDoc("Hello world");
    expect(doc).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    });
  });

  it("converts single newlines within a block into hardBreaks", () => {
    const doc = plainTextToTiptapDoc("line one\nline two");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "line one" },
        { type: "hardBreak" },
        { type: "text", text: "line two" },
      ],
    });
  });

  it("converts blank-line-separated blocks into separate paragraphs", () => {
    const doc = plainTextToTiptapDoc("First paragraph\n\nSecond paragraph");
    expect(doc.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First paragraph" }] },
      { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] },
    ]);
  });

  it("produces the standard empty document for empty text", () => {
    expect(plainTextToTiptapDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("keeps HTML-like text as inert literal text, never markup", () => {
    const doc = plainTextToTiptapDoc("<script>alert(1)</script> & <b>bold</b> \"quoted\"");
    const textNode = doc.content[0].content?.[0];
    expect(textNode).toEqual({ type: "text", text: '<script>alert(1)</script> & <b>bold</b> "quoted"' });
  });

  it("round-trips through the validator (its own output is always valid)", () => {
    const doc = plainTextToTiptapDoc("some\nplain\n\ntext with <tags> & \"quotes\"");
    const result = validateTiptapDocument(doc);
    expect(result.ok).toBe(true);
  });
});

describe("deriveDocPlainText", () => {
  it("contains paragraph text", () => {
    const doc: TiptapDocument = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello there" }] }],
    };
    expect(deriveDocPlainText(doc)).toBe("hello there");
  });

  it("contains heading text", () => {
    const doc: TiptapDocument = {
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "My Heading" }] }],
    };
    expect(deriveDocPlainText(doc)).toContain("My Heading");
  });

  it("contains bullet and numbered list item text", () => {
    const doc: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "bullet one" }] }] },
          ],
        },
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "numbered one" }] }] },
          ],
        },
      ],
    };
    const text = deriveDocPlainText(doc);
    expect(text).toContain("bullet one");
    expect(text).toContain("numbered one");
  });

  it("contains blockquote text", () => {
    const doc: TiptapDocument = {
      type: "doc",
      content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted words" }] }] }],
    };
    expect(deriveDocPlainText(doc)).toContain("quoted words");
  });

  it("never contains JSON syntax", () => {
    const doc: TiptapDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body text", marks: [{ type: "bold" }] }] },
      ],
    };
    const text = deriveDocPlainText(doc);
    expect(text).not.toMatch(/[{}[\]"]/);
    expect(text).not.toContain("type");
  });

  it("recognizes an empty document as empty", () => {
    expect(isEmptyTiptapDoc({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(isEmptyTiptapDoc({ type: "doc", content: [] })).toBe(true);
  });

  it("recognizes a non-empty document as non-empty", () => {
    expect(
      isEmptyTiptapDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] })
    ).toBe(false);
  });
});

describe("validateTiptapDocument — accepted content", () => {
  it("accepts a plain paragraph document", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts an empty document", () => {
    expect(validateTiptapDocument({ type: "doc", content: [] }).ok).toBe(true);
    expect(validateTiptapDocument({ type: "doc", content: [{ type: "paragraph" }] }).ok).toBe(true);
  });

  it("accepts bold content", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "bold" }] }] }],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts underlined content", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "underline" }] }] }],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts heading level 1 and level 2", () => {
    expect(
      validateTiptapDocument({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "h1" }] }],
      }).ok
    ).toBe(true);
    expect(
      validateTiptapDocument({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "h2" }] }],
      }).ok
    ).toBe(true);
  });

  it("accepts a bulleted list", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a numbered list, including a start attr", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a hardBreak inside a paragraph", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] }],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts italic and strikethrough content", () => {
    for (const markType of ["italic", "strike"]) {
      const result = validateTiptapDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: markType }] }] }],
      });
      expect(result.ok).toBe(true);
    }
  });

  it("accepts multiple stacked marks on the same text node", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hi", marks: [{ type: "bold" }, { type: "italic" }, { type: "strike" }] }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a link mark with an allowed scheme (http, https, mailto)", () => {
    for (const href of ["https://example.com", "http://example.com", "mailto:a@example.com"]) {
      const result = validateTiptapDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "link", attrs: { href } }] }] }],
      });
      expect(result.ok).toBe(true);
    }
  });

  it("accepts a blockquote wrapping a paragraph", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }] }],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a blockquote wrapping a list", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "bulletList",
              content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }],
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a textAlign attr on paragraphs and headings", () => {
    for (const textAlign of ["left", "center", "right"]) {
      expect(
        validateTiptapDocument({
          type: "doc",
          content: [{ type: "paragraph", attrs: { textAlign }, content: [{ type: "text", text: "x" }] }],
        }).ok
      ).toBe(true);
      expect(
        validateTiptapDocument({
          type: "doc",
          content: [{ type: "heading", attrs: { level: 1, textAlign }, content: [{ type: "text", text: "x" }] }],
        }).ok
      ).toBe(true);
    }
  });

  it("accepts a paragraph/heading with no textAlign attr at all (legacy shape)", () => {
    expect(
      validateTiptapDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
      }).ok
    ).toBe(true);
    expect(
      validateTiptapDocument({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] }],
      }).ok
    ).toBe(true);
  });
});

describe("validateTiptapDocument — rejections", () => {
  it("rejects a heading outside levels 1-2", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "h3" }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported node types (codeBlock, image)", () => {
    for (const node of [
      { type: "codeBlock", content: [{ type: "text", text: "code" }] },
      { type: "image", attrs: { src: "https://evil.example/x.png" } },
    ]) {
      const result = validateTiptapDocument({ type: "doc", content: [node] });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a nested blockquote", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "blockquote", content: [{ type: "blockquote", content: [{ type: "paragraph" }] }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty blockquote", () => {
    expect(validateTiptapDocument({ type: "doc", content: [{ type: "blockquote", content: [] }] }).ok).toBe(false);
  });

  it("rejects a link mark with a disallowed scheme (XSS/open-redirect defense)", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "ftp://example.com", "//evil.example", "/relative"]) {
      const result = validateTiptapDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }] }],
      });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a link mark missing href, or carrying extra attrs (target/rel/class)", () => {
    expect(
      validateTiptapDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: {} }] }] }],
      }).ok
    ).toBe(false);
    expect(
      validateTiptapDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }] }],
          },
        ],
      }).ok
    ).toBe(false);
  });

  it("rejects an invalid textAlign value", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", attrs: { textAlign: "justify" }, content: [{ type: "text", text: "x" }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed documents", () => {
    expect(validateTiptapDocument(null).ok).toBe(false);
    expect(validateTiptapDocument("not an object").ok).toBe(false);
    expect(validateTiptapDocument(42).ok).toBe(false);
    expect(validateTiptapDocument([]).ok).toBe(false);
    expect(validateTiptapDocument({ type: "paragraph" }).ok).toBe(false);
    expect(validateTiptapDocument({ type: "doc", content: "not-an-array" }).ok).toBe(false);
    expect(validateTiptapDocument({ type: "doc", content: [{ type: "text" }] }).ok).toBe(false);
  });

  it("rejects text nodes with unexpected attributes (e.g. injected event handlers)", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", onclick: "alert(1)" }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects marks carrying attrs", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold", attrs: { style: "color:red" } }] }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty text node", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-range orderedList start", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: -1 },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a listItem that doesn't start with a paragraph", () => {
    const result = validateTiptapDocument({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] }] }],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects excessively deep nesting", () => {
    // Build a chain of nested bulletList > listItem > bulletList > ... well
    // past TIPTAP_MAX_DEPTH.
    type Node = { type: string; content: unknown[] };
    let innermost: Node = {
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: "leaf" }] }],
    };
    for (let i = 0; i < TIPTAP_MAX_DEPTH + 10; i++) {
      innermost = { type: "listItem", content: [{ type: "bulletList", content: [innermost] }] };
    }
    const doc = { type: "doc", content: [{ type: "bulletList", content: [innermost] }] };
    const result = validateTiptapDocument(doc);
    expect(result.ok).toBe(false);
  });

  it("rejects an excessively large document", () => {
    const hugeText = "x".repeat(3_000_000);
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: hugeText }] }],
    };
    const result = validateTiptapDocument(doc);
    expect(result.ok).toBe(false);
  });
});

describe("isAllowedLinkHref", () => {
  it("allows http, https and mailto", () => {
    expect(isAllowedLinkHref("https://example.com/path?x=1")).toBe(true);
    expect(isAllowedLinkHref("http://example.com")).toBe(true);
    expect(isAllowedLinkHref("mailto:a@example.com")).toBe(true);
  });

  it("rejects other schemes, relative and protocol-relative hrefs, and empty strings", () => {
    expect(isAllowedLinkHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedLinkHref("data:text/html,x")).toBe(false);
    expect(isAllowedLinkHref("ftp://example.com")).toBe(false);
    expect(isAllowedLinkHref("//evil.example")).toBe(false);
    expect(isAllowedLinkHref("/relative/path")).toBe(false);
    expect(isAllowedLinkHref("")).toBe(false);
  });

  it("rejects a href longer than 2048 characters", () => {
    expect(isAllowedLinkHref(`https://example.com/${"x".repeat(2048)}`)).toBe(false);
  });
});

describe("normalizeLinkHref", () => {
  it("leaves an href with an explicit scheme unchanged", () => {
    expect(normalizeLinkHref("https://example.com")).toBe("https://example.com");
    expect(normalizeLinkHref("mailto:a@example.com")).toBe("mailto:a@example.com");
    expect(normalizeLinkHref("javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  it("prepends https:// to a bare domain", () => {
    expect(normalizeLinkHref("example.com")).toBe("https://example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeLinkHref("  example.com  ")).toBe("https://example.com");
  });
});
