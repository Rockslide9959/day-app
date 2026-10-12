"use client";

import { useEffect, useRef } from "react";
import { DayCell, habitColor } from "@/lib/habits";

const LEVEL_MIX = [0, 30, 55, 78, 100];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GitHub-style contribution grid, one column per week (Mon at the top).
// Past days and today are tappable to backfill or clear a check-in.
export default function Heatmap({
  columns,
  color,
  onToggle,
}: {
  columns: DayCell[][];
  color: string;
  onToggle?: (cell: DayCell) => void;
}) {
  const hex = habitColor(color);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start scrolled to the current week on narrow screens.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex gap-[3px]">
        <div className="mr-1 flex flex-col gap-[3px] pt-4 text-[9px] leading-[14px] text-zinc-400 crimson:text-crimson-text-muted">
          {["M", "", "W", "", "F", "", ""].map((l, i) => (
            <span key={i} className="h-[14px]">
              {l}
            </span>
          ))}
        </div>
        {columns.map((week, w) => {
          const month = Number(week[0].date.slice(5, 7)) - 1;
          const showMonth = w === 0 || Number(columns[w - 1][0].date.slice(5, 7)) - 1 !== month;
          return (
            <div key={week[0].date} className="flex flex-col gap-[3px]">
              <span className="h-[13px] whitespace-nowrap text-[9px] leading-[13px] text-zinc-400 crimson:text-crimson-text-muted">
                {showMonth ? MONTHS[month] : ""}
              </span>
              {week.map((d) => {
                const tappable = onToggle && d.state !== "future";
                const style: React.CSSProperties =
                  d.level > 0 ? { background: `color-mix(in srgb, ${hex} ${LEVEL_MIX[d.level]}%, transparent)` } : {};
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!tappable}
                    onClick={() => tappable && onToggle(d)}
                    title={`${d.date}${d.count ? ` · ${d.count}` : ""}`}
                    aria-label={`${d.date}: ${d.state}`}
                    className={`h-[14px] w-[14px] rounded-[4px] transition-transform enabled:hover:scale-125 enabled:active:scale-90 ${
                      d.level > 0
                        ? ""
                        : d.state === "future"
                          ? "bg-transparent"
                          : d.state === "rest" || d.state === "before"
                            ? "bg-zinc-100/60 dark:bg-zinc-800/40 crimson:bg-crimson-raised/50"
                            : "bg-zinc-100 dark:bg-zinc-800 crimson:bg-crimson-raised"
                    } ${d.state === "pending" ? "ring-1 ring-inset" : ""}`}
                    style={d.state === "pending" ? { ...style, ["--tw-ring-color" as string]: hex } : style}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
