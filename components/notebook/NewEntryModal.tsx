"use client";

import { useState } from "react";
import { todayStr } from "@/lib/dates";
import { NotebookEntryFull } from "./types";

type Kind = "choose" | "journal" | "note";

export default function NewEntryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (entry: NotebookEntryFull) => void;
}) {
  const [step, setStep] = useState<Kind>("choose");
  const [date, setDate] = useState(todayStr());
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function createJournal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryType: "journal", journalDate: date, title: title.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't create journal entry");
      }
      onCreated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create journal entry");
      setSaving(false);
    }
  }

  async function createNote(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryType: "note", title: title.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't create note");
      }
      onCreated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create note");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-lg sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "choose" && (
          <div className="space-y-3">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">New entry</h2>
              <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Close">
                ✕
              </button>
            </div>
            <button
              onClick={() => setStep("journal")}
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/60"
            >
              <span className="text-xl" aria-hidden>📓</span>
              <span>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Journal</span>
                <span className="block text-xs text-zinc-500">Write about a specific day</span>
              </span>
            </button>
            <button
              onClick={() => setStep("note")}
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/60"
            >
              <span className="text-xl" aria-hidden>📝</span>
              <span>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Note</span>
                <span className="block text-xs text-zinc-500">A general note, not tied to a date</span>
              </span>
            </button>
          </div>
        )}

        {step === "journal" && (
          <form onSubmit={createJournal} className="space-y-3">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">New journal entry</h2>
              <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Close">
                ✕
              </button>
            </div>
            <label className="block text-xs text-zinc-500">
              Journal date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Title (optional)
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to the date"
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <p className="text-[11px] text-zinc-400">
              If you already have a journal entry for this date, it will be opened instead of creating a new one.
            </p>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {saving ? "Creating…" : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="rounded-xl border border-zinc-200 px-4 text-sm text-zinc-500 dark:border-zinc-700"
              >
                Back
              </button>
            </div>
          </form>
        )}

        {step === "note" && (
          <form onSubmit={createNote} className="space-y-3">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">New note</h2>
              <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Close">
                ✕
              </button>
            </div>
            <label className="block text-xs text-zinc-500">
              Title
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {saving ? "Creating…" : "Create note"}
              </button>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="rounded-xl border border-zinc-200 px-4 text-sm text-zinc-500 dark:border-zinc-700"
              >
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
