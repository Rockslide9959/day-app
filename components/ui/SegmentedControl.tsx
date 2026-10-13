"use client";

// Equal-width segmented control whose selected pill slides between options.
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="group"
      aria-label={label}
      className={`relative grid rounded-2xl bg-zinc-100 p-1 text-xs dark:bg-zinc-800/80 crimson:bg-crimson-raised ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-xl bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.21,0.9,0.32,1)] dark:bg-zinc-700 crimson:bg-crimson-surface crimson:ring-1 crimson:ring-crimson-border"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 rounded-xl px-2.5 py-2 font-semibold capitalize ${
              active
                ? "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 crimson:text-crimson-text-secondary crimson:hover:text-crimson-text"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
