"use client";

import { useEffect, useState } from "react";
import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

// Per-device push notification switch (the daily to-do reminder delivers
// through it). Renders nothing where the browser
// can't do web push at all.
export default function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription().then((sub) => {
      setSupported(true);
      setEnabled(Boolean(sub));
    });
  }, []);

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setEnabled(false);
      } else {
        await subscribeToPush();
        setEnabled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  if (!supported) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">Push notifications</p>
        <p className="text-xs text-zinc-500 crimson:text-crimson-text-secondary">
          {enabled ? "On for this device" : "Off on this device"}
        </p>
        {error && <p className="mt-1 text-xs text-red-500 crimson:text-crimson-highlight">{error}</p>}
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium ${
          enabled
            ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 crimson:bg-crimson-raised crimson:text-crimson-text-secondary"
            : "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 crimson:bg-crimson-accent crimson:text-crimson-text"
        }`}
      >
        {busy ? "…" : enabled ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
