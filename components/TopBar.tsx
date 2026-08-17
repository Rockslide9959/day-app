"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIconStyle } from "@/components/IconStyleProvider";
import { maskIconStyle } from "@/lib/navIcon";

// Pulled out of BottomNav's scrollable row into a small fixed corner cluster
// — frequent but not "every day" destinations, so they stay reachable
// without competing for space with the tabs used constantly.
const TOP_TABS = [
  { href: "/reminders", label: "Reminders", icon: "/icons/reminders.png", emoji: "🔔" },
  { href: "/settings", label: "Settings", icon: "/icons/settings.png", emoji: "⚙️" },
];

export default function TopBar() {
  const pathname = usePathname();
  const { style } = useIconStyle();

  if (pathname === "/login" || pathname === "/signup") return null;

  return (
    <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex gap-2">
      {TOP_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            aria-label={tab.label}
            className={`flex h-9 w-9 items-center justify-center rounded-full shadow-sm backdrop-blur ${
              active
                ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                : "bg-white/70 text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-400"
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
  );
}
