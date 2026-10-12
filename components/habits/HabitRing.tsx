"use client";

import { useRef, useState } from "react";
import { habitColor } from "@/lib/habits";

const LONG_PRESS_MS = 450;
const SPARKS = 10;

// A habit's progress ring: tap to log, long-press to take one back. When the
// ring fills it pops, flashes a glow and throws a burst of sparks in the
// habit's color — only on a real transition to done, never on first render.
export default function HabitRing({
  emoji,
  color,
  count,
  target,
  size = 64,
  disabled = false,
  onTap,
  onLongPress,
  label,
}: {
  emoji: string;
  color: string;
  count: number;
  target: number;
  size?: number;
  disabled?: boolean;
  onTap?: () => void;
  onLongPress?: () => void;
  label: string;
}) {
  const hex = habitColor(color);
  const done = count >= target;
  const ratio = Math.min(1, count / target);
  const stroke = Math.max(4, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Adjusting state during render on a prop change (React's documented
  // alternative to an effect) — `burst` keys the animation so each new
  // completion replays it.
  const [burst, setBurst] = useState(0);
  const [prevDone, setPrevDone] = useState(done);
  if (done !== prevDone) {
    setPrevDone(done);
    if (done) setBurst((b) => b + 1);
  }

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  function start() {
    if (disabled || !onLongPress) return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(15);
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function cancel() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function click() {
    if (disabled) return;
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onTap?.();
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        // Desktop right-click mirrors mobile long-press.
        e.preventDefault();
        if (!disabled) onLongPress?.();
      }}
      onClick={click}
      disabled={disabled}
      aria-label={label}
      className="relative shrink-0 select-none rounded-full outline-none transition-transform [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-default disabled:opacity-40"
      style={{ width: size, height: size }}
    >
      {burst > 0 && (
        <span key={burst} aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="habit-glow absolute inset-0 rounded-full" style={{ background: hex }} />
          {Array.from({ length: SPARKS }, (_, i) => (
            <span
              key={i}
              className="habit-spark absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full"
              style={
                {
                  background: i % 2 ? hex : "#fde047",
                  "--angle": `${(360 / SPARKS) * i}deg`,
                  "--reach": `-${size * 0.75}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      )}
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={hex} strokeOpacity={0.16} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={done ? hex : "none"}
          fillOpacity={done ? 0.16 : 0}
          stroke={hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 450ms cubic-bezier(0.3, 1.2, 0.5, 1), fill-opacity 300ms" }}
        />
      </svg>
      <span
        key={`e${burst}`}
        className={`absolute inset-0 flex items-center justify-center leading-none ${burst > 0 ? "habit-pop" : ""} ${
          done || count > 0 ? "" : "opacity-70 grayscale-[40%]"
        }`}
        style={{ fontSize: size * 0.4 }}
        aria-hidden="true"
      >
        {emoji}
      </span>
      {target > 1 && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[10px] font-bold leading-tight text-white shadow-sm tabular-nums"
          style={{ background: hex }}
        >
          {count}/{target}
        </span>
      )}
    </button>
  );
}
