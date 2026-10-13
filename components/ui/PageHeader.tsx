import type { ReactNode } from "react";

// Page title block in the Today page's style: a small uppercase eyebrow, a
// large bold title and an optional subtitle. Right padding keeps it clear
// of TopBar's fixed corner buttons; actions sit on their own row below.
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5">
      <div className="pr-24">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 crimson:text-crimson-accent">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500 crimson:text-crimson-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
