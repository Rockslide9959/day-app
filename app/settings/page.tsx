"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CATEGORIES } from "@/lib/calendar/categories";
import { useTheme } from "@/components/ThemeProvider";
import { useIconStyle } from "@/components/IconStyleProvider";
import PasswordInput from "@/components/PasswordInput";
import type { ThemePreference } from "@/lib/theme";
import type { IconStyle } from "@/lib/iconStyle";
import LoadingSpinner from "@/components/LoadingSpinner";
import PushToggle from "@/components/PushToggle";
import PageHeader from "@/components/ui/PageHeader";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { PRIMARY_BUTTON, stagger } from "@/components/ui/styles";

type Category = { id: string | null; name: string; colorHex: string; custom: boolean };

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
  { value: "crimson", label: "Crimson" },
];

const ICON_STYLE_OPTIONS: { value: IconStyle; label: string }[] = [
  { value: "png", label: "Icons" },
  { value: "emoji", label: "Emoji" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { preference, setPreference } = useTheme();
  const { style, setStyle } = useIconStyle();
  const [username, setUsername] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [todoReminderEnabled, setTodoReminderEnabled] = useState(true);
  const [todoReminderTime, setTodoReminderTime] = useState("20:00");
  const [todoReminderLoaded, setTodoReminderLoaded] = useState(false);
  const [todoReminderSaving, setTodoReminderSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUsername(data?.username ?? null);
        if (data?.todoReminderEnabled !== undefined) setTodoReminderEnabled(data.todoReminderEnabled);
        if (data?.todoReminderTime) setTodoReminderTime(data.todoReminderTime);
        setTodoReminderLoaded(true);
      })
      .catch(() => {});
  }, []);

  async function saveTodoReminder(next: { enabled?: boolean; time?: string }) {
    setTodoReminderSaving(true);
    await fetch("/api/auth/todo-reminder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...next,
        // Captured on every save (cheap, and keeps it fresh if the user's
        // device/travel timezone changes) rather than only once at signup.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    setTodoReminderSaving(false);
  }

  function toggleTodoReminder() {
    const next = !todoReminderEnabled;
    setTodoReminderEnabled(next);
    saveTodoReminder({ enabled: next });
  }

  function changeTodoReminderTime(time: string) {
    setTodoReminderTime(time);
    saveTodoReminder({ time });
  }

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    setChangingPassword(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setChangingPassword(false);
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setPasswordError(data.error || "Couldn't update password");
    }
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
    <main className="phase-in mx-auto max-w-2xl px-4 pt-8">
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Make Day yours." />

      <Section title="Account">
        <div className="flex items-center justify-between rounded-3xl bg-white px-4 ring-1 ring-zinc-900/5 dark:ring-white/10 crimson:ring-crimson-border py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface">
          <span className="flex min-w-0 items-center gap-3 text-sm text-zinc-800 dark:text-zinc-100 crimson:text-crimson-text">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-violet-500 to-fuchsia-500 text-base font-bold uppercase text-white shadow-md shadow-fuchsia-500/30 crimson:from-crimson-accent crimson:to-crimson-highlight crimson:shadow-crimson-accent/30"
            >
              {username ? username[0] : "·"}
            </span>
            <span className="min-w-0 truncate">
              {username ? (
                <>
                  Logged in as <span className="font-semibold">{username}</span>
                </>
              ) : (
                "…"
              )}
            </span>
          </span>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="shrink-0 rounded-full bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight crimson:hover:bg-crimson-accent/25"
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </Section>

      <Section title="Change password">
        <form
          onSubmit={changePassword}
          className="space-y-2 rounded-3xl bg-white p-4 ring-1 ring-zinc-900/5 dark:ring-white/10 crimson:ring-crimson-border shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface"
        >
          <PasswordInput
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="Current password"
            autoComplete="current-password"
          />
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            placeholder="New password (min. 8 characters)"
            autoComplete="new-password"
          />
          <PasswordInput
            value={confirmNewPassword}
            onChange={setConfirmNewPassword}
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
          {passwordError && <p className="nudge text-xs text-red-500 crimson:text-crimson-highlight">{passwordError}</p>}
          {passwordSuccess && (
            <p className="check-pop text-xs text-green-600 dark:text-green-400 crimson:text-emerald-400">✓ Password updated.</p>
          )}
          <button
            type="submit"
            disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
            className={`${PRIMARY_BUTTON} w-full py-3 text-sm`}
          >
            {changingPassword ? "Updating…" : "Update password"}
          </button>
        </form>
      </Section>

      <Section title="Appearance">
        <p className="mb-3 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
          Choose how Day looks on this device. System automatically matches your
          device&apos;s light or dark setting.
        </p>
        <SegmentedControl label="Theme" options={THEME_OPTIONS} value={preference} onChange={setPreference} />
      </Section>

      <Section title="Navigation icons">
        <p className="mb-3 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
          Choose how the bottom navigation and the Settings icon look on this device.
        </p>
        <SegmentedControl label="Icon style" options={ICON_STYLE_OPTIONS} value={style} onChange={setStyle} />
      </Section>

      <Section title="Categories">
        <p className="mb-3 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
          Built-in categories are always available. Add your own for anything more specific.
        </p>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <ul className="mb-3 space-y-1.5">
            {categories.map((c, i) => (
              <li
                key={c.name}
                style={stagger(i)}
                className="item-in flex items-center justify-between rounded-2xl bg-white px-4 ring-1 ring-zinc-900/5 dark:ring-white/10 crimson:ring-crimson-border py-2.5 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface"
              >
                <span className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100 crimson:text-crimson-text">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.colorHex }} />
                  {c.name}
                </span>
                {c.custom && c.id ? (
                  <button
                    onClick={() => removeCategory(c.id!)}
                    className="text-xs text-zinc-300 hover:text-red-500 crimson:text-crimson-text-secondary crimson:hover:text-crimson-accent"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-zinc-300 crimson:text-crimson-text-muted">Built-in</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addCategory} className="flex gap-2 rounded-3xl bg-white p-3 ring-1 ring-zinc-900/5 dark:ring-white/10 crimson:ring-crimson-border shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 crimson:border-crimson-border crimson:bg-crimson-raised crimson:focus:border-crimson-accent"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 crimson:border-crimson-border"
          />
          <button
            type="submit"
            className={`${PRIMARY_BUTTON} shrink-0 px-4 text-sm`}
          >
            Add
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-500 crimson:text-crimson-highlight">{error}</p>}
      </Section>

      <Section title="Notifications">
        <PushToggle />
      </Section>

      <Section title="Daily to-do reminder">
        <p className="mb-3 text-xs text-zinc-500 crimson:text-crimson-text-secondary">
          If you still have unfinished to-dos by this time, Day shows a reminder on Today and — if
          you&apos;ve turned on push notifications above — sends a notification too.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-3xl bg-white px-4 ring-1 ring-zinc-900/5 dark:ring-white/10 crimson:ring-crimson-border py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Remind me</p>
            <p className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
              {todoReminderEnabled ? "On" : "Off"}
              {todoReminderSaving && " · Saving…"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={todoReminderEnabled}
            onClick={toggleTodoReminder}
            disabled={!todoReminderLoaded}
            className={`h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              todoReminderEnabled
                ? "bg-zinc-900 dark:bg-zinc-50 crimson:bg-crimson-accent"
                : "bg-zinc-200 dark:bg-zinc-700 crimson:bg-crimson-raised"
            }`}
          >
            <span
              className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform dark:bg-zinc-900 crimson:bg-crimson-text ${
                todoReminderEnabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        <label className="mt-2 flex items-center justify-between gap-3 rounded-3xl bg-white px-4 ring-1 ring-zinc-900/5 dark:ring-white/10 crimson:ring-crimson-border py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Reminder time</span>
          <input
            type="time"
            value={todoReminderTime}
            onChange={(e) => changeTodoReminderTime(e.target.value)}
            disabled={!todoReminderLoaded || !todoReminderEnabled}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm outline-none focus:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 crimson:border-crimson-border crimson:bg-crimson-raised crimson:focus:border-crimson-accent"
          />
        </label>
      </Section>

      <Section title="About notifications">
        <p className="rounded-3xl bg-white px-4 ring-1 ring-zinc-900/5 dark:ring-white/10 crimson:ring-crimson-border py-3 text-xs text-zinc-500 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface crimson:text-crimson-text-secondary">
          Push notifications are used for the daily to-do reminder and work best when the app is
          installed — but like all web push, they can&apos;t reliably wake up your phone if the
          browser has been fully closed for a long time or the OS has aggressively stopped it in
          the background. The reminder can also arrive up to ~20 minutes after the time you set.
        </p>
      </Section>
    </main>
  );
}

const SECTION_ICONS: Record<string, string> = {
  Account: "👤",
  "Change password": "🔑",
  Appearance: "🎨",
  "Navigation icons": "🧭",
  Categories: "🏷️",
  Notifications: "🔔",
  "Daily to-do reminder": "⏰",
  "About notifications": "ℹ️",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2.5 flex items-center gap-2 px-1 text-base font-bold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">
        {SECTION_ICONS[title] && (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-zinc-100 text-sm dark:bg-zinc-800 crimson:bg-crimson-raised"
          >
            {SECTION_ICONS[title]}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}
