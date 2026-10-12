"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIconStyle } from "@/components/IconStyleProvider";
import { maskIconStyle } from "@/lib/navIcon";
import QuickAddSheet from "@/components/quickAdd/QuickAddSheet";

// Pulled out of BottomNav's scrollable row into a small fixed corner cluster
// — frequent but not "every day" destinations, so they stay reachable
// without competing for space with the tabs used constantly. Quick Add sits
// beside Settings so it's one tap away from every screen (or Ctrl/⌘+K).
const TOP_TABS = [
  { href: "/settings", label: "Settings", icon: "/icons/settings.png", emoji: "⚙️" },
];

const BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full shadow-sm backdrop-blur transition active:scale-90";

export default function TopBar() {
  const pathname = usePathname();
  const { style } = useIconStyle();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const hidden = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (hidden) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickAddOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden]);

  if (hidden) return null;

  return (
    <>
      <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex gap-2">
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          aria-label="Quick add"
          title="Quick add (Ctrl+K)"
          className={`${BUTTON} bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30 crimson:from-crimson-accent crimson:to-crimson-highlight crimson:shadow-crimson-accent/40`}
        >
          {style === "emoji" ? (
            <span className="text-base leading-none">⚡</span>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
              <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5z" />
              <path d="M18.5 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" opacity=".85" />
            </svg>
          )}
        </button>
        {TOP_TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              aria-label={tab.label}
              className={`${BUTTON} ${
                active
                  ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50 crimson:bg-crimson-surface crimson:text-crimson-accent"
                  : "bg-white/70 text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-400 crimson:bg-crimson-obsidian/70 crimson:text-crimson-text-muted"
              }`}
            >
              {style === "emoji" ? (
                <span className="text-base leading-none">{tab.emoji}</span>
              ) : (
                <span
                  aria-hidden="true"
                  className="block h-4 w-4 bg-current"
                  style={maskIconStyle(tab.icon)}
                />
              )}
            </Link>
          );
        })}
      </div>
      {quickAddOpen && <QuickAddSheet onClose={() => setQuickAddOpen(false)} />}
    </>
  );
}
