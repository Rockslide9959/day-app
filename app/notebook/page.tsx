"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/dates";
import { NotebookEntryPreview, NotebookEntryFull } from "@/components/notebook/types";
import NewEntryModal from "@/components/notebook/NewEntryModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import PageHeader from "@/components/ui/PageHeader";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import { CARD, GHOST_BUTTON, INPUT, PRIMARY_BUTTON, SECTION_LABEL, stagger } from "@/components/ui/styles";

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
    <main className="phase-in mx-auto max-w-2xl px-4 pb-24 pt-8">
      <PageHeader
        eyebrow="Journal & notes"
        title="Notebook"
        subtitle={total > 0 ? `${total} ${total === 1 ? "entry" : "entries"}` : "Your thoughts, kept in one place."}
        actions={
          <button onClick={() => setShowNewEntry(true)} className={`${PRIMARY_BUTTON} px-5 py-2.5 text-sm`}>
            ＋ New entry
          </button>
        }
      />

      <label className="sr-only" htmlFor="notebook-search">
        Search notebook
      </label>
      <div className="relative mb-3">
        <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400 crimson:text-crimson-text-muted">
          🔍
        </span>
        <input
          id="notebook-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, writing and tags…"
          className={`${INPUT} w-full pl-11`}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
        <SegmentedControl label="Filter" options={FILTER_TABS} value={filter} onChange={setFilter} className="w-full min-w-0 sm:w-auto sm:flex-1" />
        <label className="sr-only" htmlFor="notebook-sort">
          Sort
        </label>
        <select
          id="notebook-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="shrink-0 rounded-2xl bg-white px-3 py-2.5 text-xs font-medium text-zinc-600 shadow-sm outline-none ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-white/10 crimson:bg-crimson-surface crimson:text-crimson-text-secondary crimson:ring-crimson-border"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="nudge mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : entries.length === 0 ? (
        debouncedQ || filter !== "all" ? (
          <EmptyState emoji="🔎" title="No entries match your search and filters." />
        ) : (
          <EmptyState emoji="📓" title="Your notebook is empty" hint="Start with a journal entry or a note." />
        )
      ) : (
        <div className="space-y-7">
          {groups.map(([key, groupEntries]) => (
            <div key={key}>
              <h2 className={`mb-2.5 px-1 ${SECTION_LABEL}`}>{monthLabel(`${key}-01`)}</h2>
              <ul className="space-y-2.5">
                {groupEntries.map((entry, i) => (
                  <EntryCard key={entry.id} entry={entry} index={i} />
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
          className={`${GHOST_BUTTON} mt-5 w-full py-3 text-sm disabled:opacity-60`}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {showNewEntry && <NewEntryModal onClose={() => setShowNewEntry(false)} onCreated={handleCreated} />}
    </main>
  );
}

function EntryCard({ entry, index }: { entry: NotebookEntryPreview; index: number }) {
  const isJournal = entry.entryType === "journal";
  const tags = entry.tags.split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <li className="item-in" style={stagger(index)}>
      <Link
        href={`/notebook/${entry.id}`}
        className={`${CARD} lift group relative flex gap-3 overflow-hidden px-4 py-3.5`}
      >
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${
            isJournal
              ? "bg-violet-100 dark:bg-violet-950/50 crimson:bg-crimson-accent/15"
              : "bg-sky-100 dark:bg-sky-950/50 crimson:bg-crimson-raised"
          }`}
        >
          {isJournal ? "📓" : "📝"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{entry.title}</span>
            {entry.pinned && (
              <span className="shrink-0 text-xs" aria-label="Pinned" title="Pinned">
                📌
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
            <span className="font-medium">{isJournal ? entry.journalDate : "Note"}</span>
            {" · "}
            Edited {relativeEdited(entry.updatedAt)}
          </p>
          {entry.preview && (
            <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300 crimson:text-crimson-text-secondary">{entry.preview}</p>
          )}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 crimson:bg-crimson-raised crimson:text-crimson-text-secondary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
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
