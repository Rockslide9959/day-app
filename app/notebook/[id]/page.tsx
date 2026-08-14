"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { NotebookEntryFull } from "@/components/notebook/types";
import { useAutosave } from "@/components/notebook/useAutosave";
import { journalDateTitle } from "@/lib/notebookFormat";

type Draft = { title: string; content: string; tags: string; pinned: boolean };

function draftKey(id: string): string {
  return `day:notebook:draft:${id}`;
}

function readLocalDraft(id: string): (Draft & { savedAt: string }) | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.savedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalDraft(id: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // Storage full/unavailable — local recovery is a nice-to-have, not required.
  }
}

function clearLocalDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    // ignore
  }
}

const STATUS_LABEL: Record<string, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — will save when you're back online",
  error: "Couldn't save",
};

export default function NotebookEntryPage() {
  const params = useParams<{ id: string }>();
  // Remount per entry id (Previous/Next navigate within this same route)
  // so autosave state, drafts and form fields never leak between entries.
  return <EntryLoader key={params.id} id={params.id} />;
}

// Fetches the entry and only ever renders <EntryForm> once real data has
// loaded. Splitting this from the form matters: useAutosave seeds its
// "already saved" baseline from whatever value it sees on its very first
// render, so if the form (and its autosave hook) mounted immediately with
// empty placeholder state, loading the real entry a moment later would
// look like an unsaved edit and fire a spurious save.
function EntryLoader({ id }: { id: string }) {
  const [entry, setEntry] = useState<NotebookEntryFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebook/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Request failed");
        const data: NotebookEntryFull = await res.json();
        if (!cancelled) setEntry(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load this entry. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading…</div>;
  }

  if (notFound || !entry) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-8">
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-400 dark:border-zinc-800">
          {notFound ? "This entry doesn't exist, or isn't yours." : loadError}
        </div>
        <Link href="/notebook" className="mt-4 block text-center text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Back to Notebook
        </Link>
      </main>
    );
  }

  return <EntryForm id={id} entry={entry} />;
}

function EntryForm({ id, entry }: { id: string; entry: NotebookEntryFull }) {
  const router = useRouter();
  const baseDraft: Draft = { title: entry.title, content: entry.content, tags: entry.tags, pinned: entry.pinned };

  const [title, setTitle] = useState(baseDraft.title);
  const [content, setContent] = useState(baseDraft.content);
  const [tags, setTags] = useState(baseDraft.tags);
  const [pinned, setPinned] = useState(baseDraft.pinned);
  const [restoreDraft, setRestoreDraft] = useState<(Draft & { savedAt: string }) | null>(() => {
    const local = readLocalDraft(id);
    if (!local || new Date(local.savedAt) <= new Date(entry.updatedAt)) return null;
    const differs = local.title !== baseDraft.title || local.content !== baseDraft.content || local.tags !== baseDraft.tags;
    return differs ? local : null;
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const hasSkippedFirstDraftWriteRef = useRef(false);
  const draft: Draft = { title, content, tags, pinned };

  // Persist a local recovery copy on every change (skipping the render
  // right after mount, so opening an unedited entry doesn't immediately
  // write a redundant draft).
  useEffect(() => {
    if (!hasSkippedFirstDraftWriteRef.current) {
      hasSkippedFirstDraftWriteRef.current = true;
      return;
    }
    writeLocalDraft(id, draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title, content, tags, pinned]);

  const save = useCallback(
    async (value: Draft) => {
      const res = await fetch(`/api/notebook/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    [id]
  );

  const { status, flush, retry } = useAutosave<Draft>({
    initialValue: baseDraft,
    value: draft,
    save,
    enabled: !restoreDraft,
    onSaved: () => clearLocalDraft(id),
  });

  function applyRestoredDraft() {
    if (!restoreDraft) return;
    setTitle(restoreDraft.title);
    setContent(restoreDraft.content);
    setTags(restoreDraft.tags);
    setRestoreDraft(null);
  }

  function discardRestoredDraft() {
    clearLocalDraft(id);
    setRestoreDraft(null);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/notebook/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      clearLocalDraft(id);
      router.push("/notebook");
    } catch {
      setDeleteError("Couldn't delete this entry. Try again.");
      setDeleting(false);
    }
  }

  async function goToNeighbor(neighborId: string | null) {
    if (!neighborId) return;
    await flush();
    router.push(`/notebook/${neighborId}`);
  }

  async function backToNotebook() {
    await flush();
    router.push("/notebook");
  }

  const isJournal = entry.entryType === "journal";

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-4 pb-24 pt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          onClick={backToNotebook}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Back to Notebook
        </button>
        <button
          onClick={() => setPinned((p) => !p)}
          aria-pressed={pinned}
          aria-label={pinned ? "Unpin this entry" : "Pin this entry"}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            pinned
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
              : "border border-zinc-200 text-zinc-500 dark:border-zinc-700"
          }`}
        >
          📌 {pinned ? "Pinned" : "Pin"}
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
          {isJournal ? `📓 ${journalDateTitle(entry.journalDate!)}` : "📝 Note"}
        </span>
        <span>Created {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>

      {restoreDraft && (
        <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="mb-2">
            You have unsaved writing from a previous session that&apos;s newer than what&apos;s saved. Restore it?
          </p>
          <div className="flex gap-2">
            <button
              onClick={applyRestoredDraft}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              Restore draft
            </button>
            <button
              onClick={discardRestoredDraft}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:text-amber-300"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <label className="sr-only" htmlFor="entry-title">
        Title
      </label>
      <input
        id="entry-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="mb-2 w-full rounded-xl border border-transparent bg-transparent px-1 text-xl font-semibold text-zinc-900 outline-none focus:border-zinc-200 focus:bg-white focus:px-3 focus:py-2 dark:text-zinc-50 dark:focus:border-zinc-700 dark:focus:bg-zinc-900"
      />

      <label className="sr-only" htmlFor="entry-content">
        Writing
      </label>
      <textarea
        id="entry-content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start writing…"
        className="min-h-[50vh] w-full flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:border-zinc-400 sm:min-h-[58vh] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />

      <label className="mt-3 block text-xs text-zinc-500" htmlFor="entry-tags">
        Tags (comma-separated)
        <input
          id="entry-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. work, ideas"
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
        <span aria-live="polite">{STATUS_LABEL[status]}</span>
        {status === "error" && (
          <button onClick={() => retry()} className="font-medium text-red-500">
            Retry
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={() => goToNeighbor(entry.neighbors?.prevId ?? null)}
          disabled={!entry.neighbors?.prevId}
          className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
        >
          ← Previous entry
        </button>
        <button
          onClick={() => goToNeighbor(entry.neighbors?.nextId ?? null)}
          disabled={!entry.neighbors?.nextId}
          className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
        >
          Next entry →
        </button>
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        {deleteError && <p className="mb-2 text-xs text-red-500">{deleteError}</p>}
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-500 dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-red-500 dark:border-zinc-700"
          >
            Delete entry
          </button>
        )}
      </div>
    </main>
  );
}
