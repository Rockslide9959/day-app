import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalNotebookDraft,
  notebookDraftKey,
  readLocalNotebookDraft,
  writeLocalNotebookDraft,
} from "@/lib/notebookDraft";
import type { TiptapDocument } from "@/lib/richText";

// The test environment is Node (see vitest.config.ts), which has no
// localStorage global — a small in-memory stand-in is enough since these
// helpers only use getItem/setItem/removeItem.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

const richDoc: TiptapDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "rich draft text" }] }],
};

describe("current-version (v2) local drafts", () => {
  it("round-trips a rich-text draft", () => {
    writeLocalNotebookDraft("entry-1", {
      title: "My title",
      content: "rich draft text",
      contentFormat: "tiptap-json",
      richContent: richDoc,
      tags: "work",
      pinned: true,
    });

    const restored = readLocalNotebookDraft("entry-1");
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(2);
    expect(restored!.title).toBe("My title");
    expect(restored!.contentFormat).toBe("tiptap-json");
    expect(restored!.richContent).toEqual(richDoc);
    expect(restored!.tags).toBe("work");
    expect(restored!.pinned).toBe(true);
    expect(typeof restored!.savedAt).toBe("string");
  });

  it("round-trips a plain-format draft with richContent left null", () => {
    writeLocalNotebookDraft("entry-2", {
      title: "Plain",
      content: "just text",
      contentFormat: "plain",
      richContent: richDoc,
      tags: "",
      pinned: false,
    });

    const restored = readLocalNotebookDraft("entry-2");
    expect(restored!.contentFormat).toBe("plain");
    expect(restored!.richContent).toBeNull();
  });

  it("does not store rendered HTML — only plain text and the JSON document", () => {
    writeLocalNotebookDraft("entry-3", {
      title: "<b>not html</b>",
      content: "<b>not html</b>",
      contentFormat: "plain",
      richContent: richDoc,
      tags: "",
      pinned: false,
    });
    const raw = localStorage.getItem(notebookDraftKey("entry-3"))!;
    const parsed = JSON.parse(raw);
    expect(parsed.title).toBe("<b>not html</b>");
    // Stored as literal text within JSON, never interpreted — confirmed by
    // it round-tripping unchanged rather than being stripped/escaped as markup.
    expect(readLocalNotebookDraft("entry-3")!.title).toBe("<b>not html</b>");
  });
});

describe("legacy (pre-rich-text, unversioned) local drafts", () => {
  it("restores an older draft that only has plain content", () => {
    localStorage.setItem(
      notebookDraftKey("entry-legacy"),
      JSON.stringify({ title: "Old note", content: "old plain text", tags: "misc", pinned: false, savedAt: "2026-08-01T00:00:00.000Z" })
    );

    const restored = readLocalNotebookDraft("entry-legacy");
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(2);
    expect(restored!.title).toBe("Old note");
    expect(restored!.content).toBe("old plain text");
    expect(restored!.contentFormat).toBe("plain");
    expect(restored!.richContent).toBeNull();
  });
});

describe("malformed local drafts", () => {
  it("returns null instead of throwing for invalid JSON", () => {
    localStorage.setItem(notebookDraftKey("entry-bad"), "{not valid json");
    expect(() => readLocalNotebookDraft("entry-bad")).not.toThrow();
    expect(readLocalNotebookDraft("entry-bad")).toBeNull();
  });

  it("returns null for JSON missing required fields", () => {
    localStorage.setItem(notebookDraftKey("entry-bad2"), JSON.stringify({ foo: "bar" }));
    expect(readLocalNotebookDraft("entry-bad2")).toBeNull();
  });

  it("returns null when localStorage has nothing stored", () => {
    expect(readLocalNotebookDraft("never-written")).toBeNull();
  });

  it("returns null (not a crash) if localStorage access itself throws", () => {
    vi.stubGlobal(
      "localStorage",
      {
        getItem: () => {
          throw new Error("SecurityError");
        },
      } as unknown as Storage
    );
    expect(() => readLocalNotebookDraft("entry-x")).not.toThrow();
    expect(readLocalNotebookDraft("entry-x")).toBeNull();
  });
});

describe("clearLocalNotebookDraft", () => {
  it("removes a stored draft", () => {
    writeLocalNotebookDraft("entry-4", {
      title: "x",
      content: "x",
      contentFormat: "plain",
      richContent: richDoc,
      tags: "",
      pinned: false,
    });
    expect(readLocalNotebookDraft("entry-4")).not.toBeNull();
    clearLocalNotebookDraft("entry-4");
    expect(readLocalNotebookDraft("entry-4")).toBeNull();
  });
});
