"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CATEGORIES } from "@/lib/calendar/categories";

type Category = { id: string | null; name: string; colorHex: string; custom: boolean };

export default function SettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUsername(data?.username ?? null))
      .catch(() => {});
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/categories");
      setCategories(await res.json());
    } catch {
      setCategories(DEFAULT_CATEGORIES.map((c) => ({ id: null, name: c.name, colorHex: c.colorHex, custom: false })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), colorHex: color }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't add that category.");
      return;
    }
    setName("");
    await load();
  }

  async function removeCategory(id: string) {
    await fetch(`/api/categories/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>

      <Section title="Account">
        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900">
          <span className="text-sm text-zinc-800 dark:text-zinc-100">
            {username ? (
              <>
                Logged in as <span className="font-medium">{username}</span>
              </>
            ) : (
              "…"
            )}
          </span>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-red-500 disabled:opacity-50 dark:border-zinc-700"
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </Section>

      <Section title="Categories">
        <p className="mb-3 text-xs text-zinc-500">
          Built-in categories are always available. Add your own for anything more specific.
        </p>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {categories.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm dark:bg-zinc-900"
              >
                <span className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.colorHex }} />
                  {c.name}
                </span>
                {c.custom && c.id ? (
                  <button
                    onClick={() => removeCategory(c.id!)}
                    className="text-xs text-zinc-300 hover:text-red-500"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-zinc-300">Built-in</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addCategory} className="flex gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-zinc-900">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-zinc-900 px-3 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Add
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </Section>

      <Section title="About reminders & notifications">
        <p className="rounded-xl bg-white px-4 py-3 text-xs text-zinc-500 shadow-sm dark:bg-zinc-900">
          Event reminders show up inside the app on the Today and Calendar screens. If you&apos;ve
          turned on push notifications under Reminders, those also fire for event reminders when
          the app is installed — but like all web push, they can&apos;t reliably wake up your phone
          if the browser has been fully closed for a long time or the OS has aggressively stopped
          it in the background. Check the Reminders page to turn push notifications on.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </div>
  );
}
