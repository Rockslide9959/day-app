"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIconStyle } from "@/components/IconStyleProvider";
import { maskIconStyle } from "@/lib/navIcon";

// Settings lives in TopBar instead (see components/TopBar.tsx)
// — trimming this list keeps the remaining tabs closer to fitting a
// 320–375px screen without scrolling.
const TABS = [
  { href: "/", label: "Today", icon: "/icons/home.png", emoji: "🏠" },
  { href: "/calendar", label: "Calendar", icon: "/icons/calendar.png", emoji: "📅" },
  { href: "/schedule", label: "Schedule", icon: "/icons/schedule.png", emoji: "🗓️" },
  { href: "/todos", label: "To-Do", icon: "/icons/todo.svg", emoji: "✅" },
  { href: "/notebook", label: "Notebook", icon: "/icons/notebook.png", emoji: "📓" },
  { href: "/habits", label: "Habits", icon: "/icons/habits.svg", emoji: "🔥" },
];

// Own scroll container per tab. Several tabs at a comfortable tap width
// don't fit a 320–375px screen evenly divided (the previous flex-1 layout),
// so this scrolls horizontally instead of shrinking tabs down to illegible
// widths — with a listRef effect keeping whichever tab is active in view.
export default function BottomNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const { style } = useIconStyle();

  useEffect(() => {
    const active = listRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname]);

  if (pathname === "/login" || pathname === "/signup") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-black/95 crimson:border-crimson-border crimson:bg-crimson-obsidian/95">
      <ul
        ref={listRef}
        className="mx-auto flex max-w-2xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="min-w-[64px] flex-1 shrink-0 basis-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                  active
                    ? "font-semibold text-zinc-900 dark:text-zinc-50 crimson:text-crimson-accent"
                    : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 crimson:text-crimson-text-muted crimson:hover:text-crimson-text-secondary"
                }`}
              >
                {/* The pill behind the icon grows in and the icon bounces when
                    a tab becomes active. */}
                <span className="relative flex h-7 w-12 items-center justify-center">
                  <span
                    aria-hidden="true"
                    className={`absolute inset-0 rounded-full bg-zinc-900/[0.07] transition-[opacity,scale] duration-300 dark:bg-white/10 crimson:bg-crimson-accent/15 ${
                      active ? "scale-100 opacity-100" : "scale-50 opacity-0"
                    }`}
                  />
                  {style === "emoji" ? (
                    <span className={`relative text-lg leading-none ${active ? "nav-pop" : ""}`}>{tab.emoji}</span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`relative block h-5 w-5 bg-current ${active ? "nav-pop" : ""}`}
                      style={maskIconStyle(tab.icon)}
                    />
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
