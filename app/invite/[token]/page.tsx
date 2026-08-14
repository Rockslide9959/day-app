"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { dayLabel, formatTime12h } from "@/lib/dates";

type InvitePreview = {
  itemType: string;
  title: string;
  notes: string | null;
  date: string;
  startTime: string;
  endTime: string;
  endDate: string | null;
  allDay: boolean;
  location: string | null;
  category: string | null;
  priority: string;
  subject: string | null;
  estimatedHours: number | null;
  sharedByUsername: string;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setPreview(data);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    setAccepting(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/${token}`, { method: "POST" });
      if (!res.ok) throw new Error();
      setAccepted(true);
    } catch {
      setError("Couldn't add this event. Try again.");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-zinc-400">Loading…</div>;
  }

  if (notFound || !preview) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-8">
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-400 dark:border-zinc-800">
          This share link is no longer valid — it may have been revoked, or the event deleted.
        </div>
        <Link href="/" className="mt-4 block text-center text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Back to Today
        </Link>
      </main>
    );
  }

  const isTask = preview.itemType === "task";
  const multiDay = !isTask && preview.endDate && preview.endDate !== preview.date;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">You&apos;ve been invited</h1>
      <p className="mb-6 text-sm text-zinc-500">Shared by {preview.sharedByUsername}</p>

      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-1.5">
          {isTask && (
            <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              ☐ Task
            </span>
          )}
          {preview.category && (
            <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {preview.category}
            </span>
          )}
        </div>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{preview.title}</h2>

        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {isTask
            ? `Due ${dayLabel(preview.date)}${!preview.allDay ? ` · ${formatTime12h(preview.startTime)}` : ""}`
            : preview.allDay
              ? multiDay
                ? `${dayLabel(preview.date)} – ${dayLabel(preview.endDate!)}`
                : `${dayLabel(preview.date)} · All day`
              : multiDay
                ? `${dayLabel(preview.date)} ${formatTime12h(preview.startTime)} – ${dayLabel(preview.endDate!)} ${formatTime12h(preview.endTime)}`
                : `${dayLabel(preview.date)} · ${formatTime12h(preview.startTime)} – ${formatTime12h(preview.endTime)}`}
        </p>

        {preview.location && <p className="text-sm text-zinc-600 dark:text-zinc-300">📍 {preview.location}</p>}

        {preview.subject && (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {preview.subject}
            {preview.estimatedHours != null && ` · ~${preview.estimatedHours}h estimated`}
          </p>
        )}

        {preview.notes && (
          <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{preview.notes}</p>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {accepted ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            Added to your calendar.{" "}
            <Link href="/calendar" className="font-medium underline">
              View it
            </Link>
          </div>
        ) : (
          <button
            onClick={accept}
            disabled={accepting}
            className="w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {accepting ? "Adding…" : "Add to my calendar"}
          </button>
        )}
      </div>
    </main>
  );
}
