"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A single persistent settings entry point. Kept deliberately minimal —
// a corner icon rather than a full app bar — so it doesn't duplicate the
// per-page <h1> every existing screen already renders.
export default function TopBar() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/signup") return null;

  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className={`fixed right-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-full text-lg shadow-sm ${
        pathname === "/settings"
          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
          : "bg-white text-zinc-500 hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      }`}
    >
      ⚙️
    </Link>
  );
}
