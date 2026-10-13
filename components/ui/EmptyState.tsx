// Friendly empty-list placeholder with a gently floating emoji.
export default function EmptyState({
  emoji,
  title,
  hint,
  className = "",
}: {
  emoji: string;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-dashed border-zinc-200 px-4 py-8 text-center dark:border-zinc-800 crimson:border-crimson-border ${className}`}
    >
      <div aria-hidden="true" className="float mb-2 text-3xl">
        {emoji}
      </div>
      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 crimson:text-crimson-text-secondary">{title}</p>
      {hint && <p className="mt-1 text-xs text-zinc-400 crimson:text-crimson-text-muted">{hint}</p>}
    </div>
  );
}
