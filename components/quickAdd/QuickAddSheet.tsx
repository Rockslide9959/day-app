"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTodayStr } from "@/lib/useTodayStr";
import { parseQuickAdd } from "@/lib/quickAdd/parse";
import { describeAction } from "@/lib/quickAdd/describe";
import type { QuickAddContext, QuickAddResult } from "@/lib/quickAdd/types";
import { DATA_CHANGED_EVENT } from "@/lib/useDataChanged";


const EXAMPLES = [
  "Date night Oct 15 at 7pm",
  "Essay due Nov 9 at midnight",
  "Gym every Mon & Wed 6am",
  "Drank 3 glasses of water",
  "Buy flowers tomorrow",
  "New habit: read 20 pages daily",
  "Note: gift ideas - candle, socks",
  "Journal: today was a good day",
];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

function clock() {
  const d = new Date();
  return {
    nowMinutes: d.getHours() * 60 + d.getMinutes(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export default function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const today = useTodayStr();
  const [text, setText] = useState("");
  const [ctx, setCtx] = useState<QuickAddContext | null>(null);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<QuickAddResult[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [undone, setUndone] = useState<Set<number>>(new Set());
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [speechSupported] = useState(() => Boolean(getSpeechRecognition()));

  useEffect(() => {
    const { nowMinutes, timeZone } = clock();
    const params = new URLSearchParams({ today, nowMinutes: String(nowMinutes), timeZone });
    fetch(`/api/quick-add?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setCtx(data.context);
        setAi(Boolean(data.ai));
      })
      .catch(() => {});
  }, [today]);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      recognitionRef.current?.stop();
    };
  }, [onClose]);

  // Grow the textarea with its content.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const preview = useMemo(() => {
    if (!ctx || !text.trim()) return [];
    return parseQuickAdd(text, { ...ctx, today, ...clock() }).map((a) => describeAction(a, today));
  }, [text, ctx, today]);

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, today, ...clock() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Something went wrong — try again.");
        return;
      }
      if (data.results?.length) {
        setResults(data.results);
        setUndone(new Set());
        navigator.vibrate?.(20);
        window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
      } else {
        setMessage(data.message || "I couldn't work out what to add.");
      }
    } catch {
      setMessage("You're offline — try again when you're connected.");
    } finally {
      setBusy(false);
    }
  }

  async function undo(i: number, r: QuickAddResult) {
    if (!r.undo) return;
    const res = await fetch("/api/quick-add/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ undo: r.undo }),
    });
    if (res.ok || res.status === 404) {
      setUndone((prev) => new Set(prev).add(i));
      window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
    }
  }

  function addAnother() {
    setResults(null);
    setText("");
    setMessage(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    const base = text ? `${text.trimEnd()} ` : "";
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setText(base + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-start sm:pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Quick add"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="quick-add-in max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl sm:rounded-3xl dark:bg-zinc-900 crimson:bg-crimson-surface"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-violet-500 to-fuchsia-500 text-sm text-white crimson:from-crimson-accent crimson:to-crimson-highlight">
              ✦
            </span>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Quick add</h2>
            {ai && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 crimson:bg-crimson-accent/20 crimson:text-crimson-highlight">
                AI
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 crimson:text-crimson-text-muted crimson:hover:bg-crimson-raised">
            ✕
          </button>
        </div>

        {results ? (
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 crimson:text-crimson-text">
              {results.every((r) => r.ok) ? "Done ✨" : "Mostly done"}
            </p>
            <ul className="mb-4 space-y-2">
              {results.map((r, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 transition ${
                    undone.has(i)
                      ? "opacity-50 ring-zinc-200 dark:ring-zinc-800 crimson:ring-crimson-border"
                      : r.ok
                        ? "bg-emerald-50/60 ring-emerald-200/70 dark:bg-emerald-950/20 dark:ring-emerald-900/50 crimson:bg-crimson-raised crimson:ring-crimson-border"
                        : "bg-red-50 ring-red-200 dark:bg-red-950/30 dark:ring-red-900/50"
                  }`}
                >
                  <span className="text-xl leading-none">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text ${undone.has(i) ? "line-through" : ""}`}>
                      {r.title}
                    </span>
                    <span className="block truncate text-xs text-zinc-500 crimson:text-crimson-text-secondary">
                      {undone.has(i) ? "Undone" : r.ok ? r.detail : r.error}
                    </span>
                  </span>
                  {r.ok && !undone.has(i) && (
                    <span className="flex shrink-0 gap-1">
                      {r.href && (
                        <Link
                          href={r.href}
                          onClick={onClose}
                          className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800 crimson:text-crimson-text-secondary crimson:hover:bg-crimson-surface"
                        >
                          View
                        </Link>
                      )}
                      {r.undo && (
                        <button
                          onClick={() => undo(i, r)}
                          className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800 crimson:text-crimson-text-secondary crimson:hover:bg-crimson-surface"
                        >
                          Undo
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={addAnother}
                className="rounded-2xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 crimson:bg-crimson-raised crimson:text-crimson-text"
              >
                Add another
              </button>
              <button
                onClick={onClose}
                className="rounded-2xl bg-zinc-900 py-3 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="relative rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 transition focus-within:ring-2 focus-within:ring-violet-400 dark:bg-zinc-950 dark:ring-zinc-800 crimson:bg-crimson-obsidian crimson:ring-crimson-border crimson:focus-within:ring-crimson-accent">
              <textarea
                ref={inputRef}
                value={text}
                rows={1}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Add anything… “dinner with Sam Friday 7pm”"
                aria-label="What do you want to add?"
                disabled={busy}
                className="block w-full resize-none bg-transparent px-4 py-3.5 pr-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden text-[15px] leading-snug outline-none placeholder:text-zinc-400 disabled:opacity-60 crimson:placeholder:text-crimson-text-muted"
              />
              <div className="absolute bottom-2 right-2 flex gap-1.5">
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-label={listening ? "Stop dictation" : "Dictate"}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                      listening
                        ? "animate-pulse bg-rose-500 text-white"
                        : "text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 crimson:text-crimson-text-muted crimson:hover:bg-crimson-raised"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                    </svg>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!text.trim() || busy}
                  aria-label="Add"
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-md transition active:scale-90 disabled:opacity-30 crimson:from-crimson-accent crimson:to-crimson-highlight"
                >
                  {busy ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {message && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 crimson:bg-amber-950/40 crimson:text-amber-300">
                {message}
              </p>
            )}

            {preview.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 crimson:text-crimson-text-muted">
                  {busy ? "Adding…" : ai ? "Preview · AI double-checks on add" : "Will add"}
                </p>
                <ul className={`space-y-1.5 ${busy ? "animate-pulse" : ""}`}>
                  {preview.map((p, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/50 crimson:bg-crimson-raised">
                      <span className="text-lg leading-none">{p.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{p.title}</span>
                        <span className="block truncate text-xs text-zinc-500 crimson:text-crimson-text-secondary">{p.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              !text.trim() && (
                <div className="mt-4">
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 crimson:text-crimson-text-muted">
                    Try
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          setText(ex);
                          inputRef.current?.focus();
                        }}
                        className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 crimson:bg-crimson-raised crimson:text-crimson-text-secondary"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 px-1 text-[11px] text-zinc-400 crimson:text-crimson-text-muted">
                    Events, deadlines, to-dos, habits, notes and journal entries. Put several on separate lines.
                  </p>
                </div>
              )
            )}
          </form>
        )}
      </div>
    </div>
  );
}
