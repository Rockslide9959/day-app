// Device-local nav icon style preference — mirrors lib/theme.ts's pattern:
// persisted only in localStorage, one device at a time, not synced through
// the account/API layer.

export const ICON_STYLE_STORAGE_KEY = "day:navIconStyle";

export type IconStyle = "png" | "emoji";

const ICON_STYLES: readonly IconStyle[] = ["png", "emoji"];

export function isIconStyle(value: unknown): value is IconStyle {
  return typeof value === "string" && (ICON_STYLES as readonly string[]).includes(value);
}

export function isStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

export function readStoredIconStyle(): IconStyle {
  if (!isStorageAvailable()) return "png";
  try {
    const raw = localStorage.getItem(ICON_STYLE_STORAGE_KEY);
    return isIconStyle(raw) ? raw : "png";
  } catch {
    // Storage disabled/blocked (e.g. some private-browsing modes) — treat
    // exactly like "nothing stored yet".
    return "png";
  }
}

export function writeStoredIconStyle(style: IconStyle): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(ICON_STYLE_STORAGE_KEY, style);
  } catch {
    // Quota/blocked — the preference just won't survive a refresh; the
    // in-memory state this tick is still correct.
  }
}
