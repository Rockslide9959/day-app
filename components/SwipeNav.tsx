"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// Same order as the BottomNav tabs (see components/BottomNav.tsx) — swiping
// left/right steps forward/back through this list. Routes outside this list
// (settings, reminders, notebook/[id], login, etc.) opt out entirely so the
// gesture never fights with in-page interactions like text selection.
const TAB_ORDER = ["/", "/calendar", "/schedule", "/todos", "/notebook", "/timers", "/routines"];

const SWIPE_THRESHOLD = 60;
const MAX_OFF_AXIS = 45;

export default function SwipeNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const index = TAB_ORDER.indexOf(pathname);
  const prevIndexRef = useRef<number | null>(null);
  const [anim, setAnim] = useState<"left" | "right" | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const prevIndex = prevIndexRef.current;
    if (index !== -1 && prevIndex !== null && prevIndex !== -1 && index !== prevIndex) {
      setAnim(index > prevIndex ? "left" : "right");
    }
    prevIndexRef.current = index;
  }, [index]);

  function onTouchStart(e: React.TouchEvent) {
    if (index === -1) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (index === -1 || !start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > MAX_OFF_AXIS) return;

    if (dx < 0 && index < TAB_ORDER.length - 1) {
      router.push(TAB_ORDER[index + 1]);
    } else if (dx > 0 && index > 0) {
      router.push(TAB_ORDER[index - 1]);
    }
  }

  // Non-tab routes (detail pages, auth, settings) render as-is — no gesture
  // listeners, no forced remount/animation.
  if (index === -1) {
    return <div className="flex-1 pb-20">{children}</div>;
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex-1 touch-pan-y overflow-x-hidden pb-20"
    >
      <div
        key={pathname}
        className={
          anim === "left" ? "page-slide-in-left" : anim === "right" ? "page-slide-in-right" : ""
        }
      >
        {children}
      </div>
    </div>
  );
}
