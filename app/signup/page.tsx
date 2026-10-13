"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { PRIMARY_BUTTON } from "@/components/ui/styles";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace(params.get("next") || "/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't create that account");
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-50 px-6 dark:bg-black crimson:bg-crimson-obsidian">
      <div aria-hidden="true" className="drift pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-violet-400/30 blur-3xl dark:bg-violet-600/20 crimson:bg-crimson-accent/25" />
      <div aria-hidden="true" className="drift-slow pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-sky-400/30 blur-3xl dark:bg-sky-600/20 crimson:bg-crimson-highlight/15" />
      <form
        onSubmit={handleSubmit}
        className="phase-in relative w-full max-w-sm rounded-3xl bg-white/90 p-7 shadow-xl ring-1 ring-zinc-900/5 backdrop-blur dark:bg-zinc-900/90 dark:ring-white/10 crimson:bg-crimson-surface/90 crimson:ring-crimson-border"
      >
        <div aria-hidden="true" className="habit-pop mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-2xl shadow-lg shadow-fuchsia-500/30 crimson:from-crimson-accent crimson:to-crimson-highlight crimson:shadow-crimson-accent/30">☀️</div>
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Day</h1>
        <p className="mb-6 text-sm text-zinc-500 crimson:text-crimson-text-secondary">Create your account</p>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="mb-3 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 transition-colors text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 crimson:border-crimson-border crimson:bg-crimson-raised crimson:text-crimson-text crimson:focus:border-crimson-accent"
        />
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="Password (min. 8 characters)"
          autoComplete="new-password"
          className="mb-3"
        />
        <PasswordInput
          value={confirm}
          onChange={setConfirm}
          placeholder="Confirm password"
          autoComplete="new-password"
          className="mb-3"
        />
        {error && <p className="nudge mb-3 text-sm text-red-500 crimson:text-crimson-highlight">{error}</p>}
        <button
          type="submit"
          disabled={loading || !username || !password || !confirm}
          className={`${PRIMARY_BUTTON} w-full py-3`}
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>
        <p className="mt-4 text-center text-sm text-zinc-500 crimson:text-crimson-text-secondary">
          Already have an account?{" "}
          <Link
            href={params.get("next") ? `/login?next=${encodeURIComponent(params.get("next")!)}` : "/login"}
            className="font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
          >
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
