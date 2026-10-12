import { DayCell, habitColor } from "@/lib/habits";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

// This week, Monday → Sunday, one dot per day: solid when done, a partial
// tint for some progress, a breathing outline for today, faint for rest
// days and anything not here yet.
export default function WeekDots({ week, color, today }: { week: DayCell[]; color: string; today: string }) {
  const hex = habitColor(color);
  return (
    <div className="flex gap-1.5" aria-label="This week">
      {week.map((d, i) => {
        const isToday = d.date === today;
        let style: React.CSSProperties = {};
        let extra = "";
        switch (d.state) {
          case "done":
            style = { background: hex };
            break;
          case "partial":
            style = { background: `color-mix(in srgb, ${hex} 40%, transparent)` };
            break;
          case "pending":
            style = { boxShadow: `inset 0 0 0 2px ${hex}` };
            extra = "habit-breathe";
            break;
          case "missed":
            extra = "bg-zinc-200 dark:bg-zinc-700 crimson:bg-crimson-border";
            break;
          default:
            extra = "bg-zinc-100 dark:bg-zinc-800/70 crimson:bg-crimson-raised";
        }
        return (
          <span key={d.date} className="flex flex-col items-center gap-0.5" title={`${d.date}: ${d.state}`}>
            <span className={`block h-3.5 w-3.5 rounded-full ${extra}`} style={style} />
            <span
              className={`text-[9px] leading-none ${
                isToday
                  ? "font-bold text-zinc-700 dark:text-zinc-200 crimson:text-crimson-text"
                  : "text-zinc-400 crimson:text-crimson-text-muted"
              }`}
            >
              {LETTERS[i]}
            </span>
          </span>
        );
      })}
    </div>
  );
}
