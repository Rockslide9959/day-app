import { useId } from "react";
import { flameTier } from "@/lib/habits";

const SIZES = [14, 14, 16, 18, 21];

// Streak counter with a flame that grows and flickers harder as the streak
// climbs (lib/habits.ts#flameTier) — grey and still at zero.
export default function FlameBadge({ streak, className = "" }: { streak: number; className?: string }) {
  const tier = flameTier(streak);
  const size = SIZES[tier];
  const lit = tier > 0;
  // Per-instance gradient id — a shared one would let the first badge on
  // the page (lit or grey) color every other badge.
  const gradientId = useId();

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${
        lit ? "text-orange-600 dark:text-orange-400 crimson:text-orange-400" : "text-zinc-400 crimson:text-crimson-text-muted"
      } ${className}`}
      title={`${streak}-day streak`}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        className={tier >= 4 ? "flame-flicker-fast" : tier >= 2 ? "flame-flicker" : ""}
        style={tier >= 3 ? { filter: "drop-shadow(0 0 4px rgba(249,115,22,0.7))" } : undefined}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={lit ? "#ea580c" : "#a1a1aa"} />
            <stop offset="1" stopColor={lit ? "#facc15" : "#d4d4d8"} />
          </linearGradient>
        </defs>
        <path
          d="M12 2c.6 3.2 2.6 4.9 4.3 6.8C18 10.7 19 12.6 19 15a7 7 0 0 1-14 0c0-2.3 1-4.1 2.4-5.5.3 1.7 1.1 2.9 2.4 3.4C9.4 9.4 10.4 5.3 12 2Z"
          fill={`url(#${gradientId})`}
        />
        {lit && <path d="M12 12.5c.3 1.5 1.3 2.3 2 3.2.5.6.8 1.3.8 2a2.8 2.8 0 0 1-5.6 0c0-1.5.8-2.5 1.6-3.2.2.6.5 1 1 1.2-.1-1.2.1-2.3.2-3.2Z" fill="#fef9c3" />}
      </svg>
      {streak}
    </span>
  );
}
