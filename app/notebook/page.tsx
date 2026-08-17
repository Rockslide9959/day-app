"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/dates";
import { NotebookEntryPreview, NotebookEntryFull } from "@/components/notebook/types";
import NewEntryModal from "@/components/notebook/NewEntryModal";

type FilterTab = "all" | "journal" | "note" | "pinned";
type SortOption = "updated" | "newest" | "oldest";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "journal", label: "Journal" },
  { value: "note", label: "Notes" },
  { value: "pinned", label: "Pinned" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const LIMIT = 30;

function relativeEdited(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupKey(entry: NotebookEntryPreview): string {
  return (entry.journalDate ?? entry.updatedAt).slice(0, 7);
}

function NotebookPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<FilterTab>((searchParams.get("filter") as FilterTab) || "all");
  const [sort, setSort] = useState<SortOption>((searchParams.get("sort") as SortOption) || "updated");
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [debouncedQ, setDebouncedQ] = useState(q);

  const [entries, setEntries] = useState<NotebookEntryPreview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [showNewEntry, setShowNewEntry] = useState(false);

  // Debounce search input so the API isn't called on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(handle);
  }, [q]);

  // Keep filters in the URL so Back navigation restores them.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (sort !== "updated") params.set("sort", sort);
    if (debouncedQ) params.set("q", debouncedQ);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort, debouncedQ]);

  const load = useCallback(
    async (offset: number) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError("");
      try {
        const params = new URLSearchParams({
          type: filter === "pinned" ? "all" : filter,
          sort,
          limit: String(LIMIT),
          offset: String(offset),
        });
        if (filter === "pinned") params.set("pinned", "true");
        if (debouncedQ) params.set("q", debouncedQ);
        const res = await fetch(`/api/notebook?${params.toString()}`);
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        setEntries((prev) => (offset === 0 ? data.entries : [...prev, ...data.entries]));
        setTotal(data.total);
      } catch {
        setError("Couldn't load your notebook. Check your connection and try again.");
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [filter, sort, debouncedQ]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, NotebookEntryPreview[]>();
    for (const entry of entries) {
      const key = groupKey(entry);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return [...map.entries()];
  }, [entries]);

  function handleCreated(entry: NotebookEntryFull) {
    router.push(`/notebook/${entry.id}`);
  }

  return (
    // Extra top clearance below sm: TopBar's fixed Reminders/Settings buttons
    // sit at the same top-right corner as this row's "+ New entry" button on
    // narrow screens (see components/TopBar.tsx) — pt-8 alone let them overlap.
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4rem)] sm:pt-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Notebook</h1>
        <button
          onClick={() => setShowNewEntry(true)}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          + New entry
        </button>
      </div>

      <label className="sr-only" htmlFor="notebook-search">
        Search notebook
      </label>
      <input
        id="notebook-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles, writing and tags…"
        className="mb-3 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`flex-1 rounded-md py-1.5 font-medium ${
                filter === tab.value
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="notebook-sort">
          Sort
        </label>
        <select
          id="notebook-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-400 dark:border-zinc-800">
          {debouncedQ || filter !== "all"
            ? "No entries match your search and filters."
            : "Your notebook is empty. Start with a journal entry or a note."}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([key, groupEntries]) => (
            <div key={key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {monthLabel(`${key}-01`)}
              </h2>
              <ul className="space-y-2">
                {groupEntries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!loading && entries.length < total && (
        <button
          onClick={() => load(entries.length)}
          disabled={loadingMore}
          className="mt-4 w-full rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-500 disabled:opacity-60 dark:border-zinc-700"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {showNewEntry && <NewEntryModal onClose={() => setShowNewEntry(false)} onCreated={handleCreated} />}
    </main>
  );
}

function EntryCard({ entry }: { entry: NotebookEntryPreview }) {
  const isJournal = entry.entryType === "journal";
  const tags = entry.tags.split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <li>
      <Link
        href={`/notebook/${entry.id}`}
        className="block rounded-xl bg-white px-4 py-3 shadow-sm hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-sm" aria-hidden>
              {isJournal ? "📓" : "📝"}
            </span>
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{entry.title}</span>
          </span>
          {entry.pinned && (
            <span className="shrink-0 text-xs" aria-label="Pinned" title="Pinned">
              📌
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          <span className="font-medium">{isJournal ? entry.journalDate : "Note"}</span>
          {" · "}
          Edited {relativeEdited(entry.updatedAt)}
        </p>
        {entry.preview && (
          <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">{entry.preview}</p>
        )}
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}

export default function NotebookPage() {
  return (
    <Suspense>
      <NotebookPageInner />
    </Suspense>
  );
}
