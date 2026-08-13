"use client";

import { CategoryDef } from "@/lib/calendar/categories";

export default function CategoryFilter({
  categories,
  hidden,
  onToggle,
}: {
  categories: CategoryDef[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {categories.map((c) => {
        const isHidden = hidden.has(c.name);
        return (
          <button
            key={c.name}
            onClick={() => onToggle(c.name)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              isHidden
                ? "border-zinc-200 text-zinc-400 dark:border-zinc-800"
                : "border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: isHidden ? undefined : c.colorHex }}
            />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
