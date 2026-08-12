"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace(params.get("next") || "/");
      router.refresh();
    } else {
      setError("Incorrect passcode");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-900"
      >
        <h1 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Day
        </h1>
        <p className="mb-6 text-sm text-zinc-500">Enter your passcode to continue</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-lg tracking-widest text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          placeholder="••••"
        />
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || !passcode}
          className="w-full rounded-xl bg-zinc-900 py-3 font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
