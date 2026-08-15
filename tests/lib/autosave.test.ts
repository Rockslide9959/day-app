import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveController } from "@/lib/autosave";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutosaveController debounce behaviour", () => {
  it("does not issue a request per keystroke — only once after the debounce delay", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController<string>({ delayMs: 900, save });
    controller.markSaved("");

    controller.notify("h");
    controller.notify("he");
    controller.notify("hel");
    controller.notify("hell");
    controller.notify("hello");

    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(900);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("hello");
  });

  it("does not save when the value equals what's already saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController<string>({ delayMs: 900, save });
    controller.markSaved("hello");

    controller.notify("hello");
    await vi.advanceTimersByTimeAsync(900);

    expect(save).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe("saved");
  });

  it("flush() saves immediately without waiting for the debounce timer", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController<string>({ delayMs: 900, save });
    controller.markSaved("");

    controller.notify("draft text");
    await controller.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("saved");
  });
});

describe("AutosaveController failure handling", () => {
  it("a failed save reports an error status without discarding the pending value", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network down"));
    const statuses: string[] = [];
    const controller = new AutosaveController<string>({
      delayMs: 900,
      save,
      onStatusChange: (s) => statuses.push(s),
    });
    controller.markSaved("");

    controller.notify("important unsaved text");
    await controller.flush();

    expect(controller.getStatus()).toBe("error");
    expect(controller.hasUnsavedChanges()).toBe(true);
    expect(statuses).toContain("error");
  });

  it("retry() re-attempts the same pending value after a failure, and succeeds once the save works", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(undefined);
    const onSaved = vi.fn();
    const controller = new AutosaveController<string>({ delayMs: 900, save, onSaved });
    controller.markSaved("");

    controller.notify("important unsaved text");
    await controller.flush();
    expect(controller.getStatus()).toBe("error");

    await controller.retry();
    expect(controller.getStatus()).toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("important unsaved text");
    expect(onSaved).toHaveBeenCalledWith("important unsaved text");
  });
});

describe("AutosaveController offline handling", () => {
  it("does not attempt a request while offline, and flushes once back online", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController<string>({ delayMs: 900, save });
    controller.markSaved("");
    controller.setOnline(false);

    controller.notify("written while offline");
    await vi.advanceTimersByTimeAsync(900);
    expect(save).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe("offline");

    controller.setOnline(true);
    await controller.flush();
    expect(save).toHaveBeenCalledWith("written while offline");
    expect(controller.getStatus()).toBe("saved");
  });
});

type RichDraft = {
  title: string;
  contentFormat: "plain" | "tiptap-json";
  richContent: { type: "doc"; content: unknown[] };
  tags: string;
  pinned: boolean;
};

function draft(text: string): RichDraft {
  return {
    title: "Entry",
    contentFormat: "tiptap-json",
    richContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    tags: "",
    pinned: false,
  };
}

describe("AutosaveController with rich-text draft values", () => {
  it("opening an entry unchanged never issues a save — the JSON document must compare reliably, not by reference", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController<RichDraft>({ delayMs: 900, save });
    const initial = draft("unchanged text");
    controller.markSaved(initial);

    // A structurally-identical but distinct object instance — as if React
    // re-rendered and rebuilt the draft object without any real edit.
    controller.notify(draft("unchanged text"));
    await vi.advanceTimersByTimeAsync(900);

    expect(save).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe("saved");
  });

  it("editing rich content triggers exactly one debounced save with the latest document", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController<RichDraft>({ delayMs: 900, save });
    controller.markSaved(draft(""));

    controller.notify(draft("h"));
    controller.notify(draft("he"));
    controller.notify(draft("hello"));
    await vi.advanceTimersByTimeAsync(900);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(draft("hello"));
  });

  it("a failed autosave preserves the rich content for a later retry", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network down"));
    const controller = new AutosaveController<RichDraft>({ delayMs: 900, save });
    controller.markSaved(draft(""));

    controller.notify(draft("important unsaved writing"));
    await controller.flush();

    expect(controller.getStatus()).toBe("error");
    expect(controller.hasUnsavedChanges()).toBe(true);
  });

  it("retry saves the latest rich content, not a stale earlier version", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(undefined);
    const controller = new AutosaveController<RichDraft>({ delayMs: 900, save });
    controller.markSaved(draft(""));

    controller.notify(draft("first draft"));
    await controller.flush();
    expect(controller.getStatus()).toBe("error");

    controller.notify(draft("final version"));
    await controller.retry();

    expect(controller.getStatus()).toBe("saved");
    expect(save).toHaveBeenLastCalledWith(draft("final version"));
  });
});

describe("AutosaveController stale-response guard", () => {
  it("an older in-flight save completing later does not clobber a newer save's status", async () => {
    let resolveFirst!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => Promise.resolve());

    const controller = new AutosaveController<string>({ delayMs: 900, save });
    controller.markSaved("");

    controller.notify("first version");
    const firstFlush = controller.flush();
    expect(controller.getStatus()).toBe("saving");

    // A second, newer save starts (and completes) before the first
    // request's response comes back.
    controller.notify("second version");
    await controller.flush();
    expect(controller.getStatus()).toBe("saved");

    // The stale first request finally resolves — it must not flip status
    // back or otherwise override the newer, already-saved state.
    resolveFirst();
    await firstFlush;
    expect(controller.getStatus()).toBe("saved");
  });
});
