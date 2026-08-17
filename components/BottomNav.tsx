"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today", icon: "/icons/home.png" },
  { href: "/calendar", label: "Calendar", icon: "/icons/calendar.png" },
  { href: "/schedule", label: "Schedule", icon: "/icons/schedule.png" },
  { href: "/todos", label: "To-Do", icon: "/icons/todo.png" },
  { href: "/notebook", label: "Notebook", icon: "/icons/notebook.png" },
  { href: "/reminders", label: "Reminders", icon: "/icons/reminders.png" },
  { href: "/timers", label: "Timers", icon: "/icons/timers.png" },
  { href: "/routines", label: "Routines", icon: "/icons/routines.png" },
  { href: "/settings", label: "Settings", icon: "/icons/settings.png" },
];

// Own scroll container per tab. 8 tabs at a comfortable tap width don't
// fit a 320–375px screen evenly divided (the previous flex-1 layout), so
// this scrolls horizontally instead of shrinking tabs down to illegible
// widths — with a listRef effect keeping whichever tab is active in view.
export default function BottomNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const active = listRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname]);

  if (pathname === "/login" || pathname === "/signup") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-black/95">
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
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${
                  active
                    ? "text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="block h-5 w-5 bg-current"
                  style={{
                    WebkitMaskImage: `url(${tab.icon})`,
                    maskImage: `url(${tab.icon})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
