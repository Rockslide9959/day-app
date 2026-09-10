"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// A real, tappable back control — bordered, padded, with a chevron that
// nudges left on hover/press — replacing the bare "← text" links that used
// to sit at the top of detail pages. Pass `href` for a Link to a known
// parent; omit it to fall back to browser history (router.back()).
export default function BackButton({
  href,
  onClick,
  children = "Back",
  className = "",
}: {
  href?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  const classes =
    "group inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition " +
    "hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.97] " +
    "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 " +
    "crimson:border-crimson-border crimson:bg-crimson-surface crimson:text-crimson-text crimson:hover:border-crimson-accent crimson:hover:bg-crimson-raised " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500 crimson:focus-visible:ring-crimson-accent " +
    className;

  const label = (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5 group-active:-translate-x-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13 5 8l5-5" />
      </svg>
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick ?? (() => router.back())} className={classes}>
      {label}
    </button>
  );
}
