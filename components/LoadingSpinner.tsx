export default function LoadingSpinner({
  label = "Loading",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 py-16 text-zinc-400 dark:text-zinc-500 crimson:text-crimson-text-muted ${className}`}
    >
      <p className="text-sm font-medium tracking-wide">{label}</p>
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-[3px] border-zinc-200 border-t-zinc-500 dark:border-zinc-800 dark:border-t-zinc-400 crimson:border-crimson-border crimson:border-t-crimson-accent"
      />
    </div>
  );
}
