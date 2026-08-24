// Device-local appearance preference — deliberately NOT synced through the
// account/API layer (see prisma/schema.prisma: no Theme field on User).
// Persisted only in localStorage, one device at a time.

export const THEME_STORAGE_KEY = "day:theme";

export type ThemePreference = "light" | "dark" | "system" | "crimson";
export type ResolvedTheme = "light" | "dark" | "crimson";

const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system", "crimson"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

// "system" resolves against whatever the OS/browser reports right now —
// callers re-resolve on every matchMedia change rather than caching this.
// "crimson" is a direct pass-through like "light"/"dark" — there's no OS
// signal for it, so it's only ever reachable via an explicit user choice.
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

// Guarded on `localStorage` rather than `window` so this (and the read/write
// helpers below) can be unit-tested in Vitest's default Node environment by
// stubbing a minimal `globalThis.localStorage`, without pulling in jsdom.
export function isStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// No stored/valid preference (new user, private browsing, corrupted value)
// falls back to "system" — identical to this app's behavior before this
// setting existed, when every dark: utility just followed the OS directly.
export function readStoredThemePreference(): ThemePreference {
  if (!isStorageAvailable()) return "system";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    // Storage disabled/blocked (e.g. some private-browsing modes) — treat
    // exactly like "nothing stored yet".
    return "system";
  }
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Quota/blocked — the preference just won't survive a refresh; the
    // in-memory state this tick is still correct.
  }
}

// <meta name="theme-color"> pair for the resolved themes, matching the
// app's existing palette: light mirrors body's bg-zinc-50, dark reuses the
// value already hardcoded in app/layout.tsx's (static, SSR-time) viewport
// export and public/manifest.json's theme_color. crimson reuses the brand
// kit's Obsidian page background (see app/globals.css's crimson tokens).
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#fafafa",
  dark: "#18181b",
  crimson: "#070708",
};

// Applies a resolved theme to the live document: toggles the `.dark` class
// Tailwind's custom dark variant (see app/globals.css) keys off of, syncs
// `color-scheme` so native form controls/scrollbars render correctly, and
// keeps the <meta name="theme-color"> tag (browser chrome / PWA status bar)
// in step with a manual override rather than only the OS setting.
//
// "crimson" also toggles `.dark` alongside its own `.crimson` class —
// Crimson Night is visually a dark theme, so any element that only has a
// `dark:` override and no bespoke `crimson:` one yet still renders sensibly
// instead of falling back to light-mode white/zinc-50 surfaces.
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved !== "light");
  root.classList.toggle("crimson", resolved === "crimson");
  root.style.colorScheme = resolved === "light" ? "light" : "dark";
  root.dataset.theme = resolved;

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLOR[resolved]);
}

// Runs once, synchronously, before React hydrates (see the inline <script>
// in app/layout.tsx) so the correct theme is on <html> before first paint —
// otherwise a returning dark-mode user would see a flash of the light
// default (or vice versa) while the JS bundle loads and ThemeProvider mounts.
//
// This duplicates isThemePreference/resolveTheme's logic rather than
// importing them: an inline bootstrap script can't `import` a module, and
// must run standalone before any bundle executes. Keep the two in sync if
// the resolution rules ever change. Never interpolate request/user data into
// this string — it must stay a fixed, static script body.
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var p=(s==="light"||s==="dark"||s==="system"||s==="crimson")?s:"system";var d=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var r=p==="system"?(d?"dark":"light"):p;var e=document.documentElement;e.classList.toggle("dark",r!=="light");e.classList.toggle("crimson",r==="crimson");e.style.colorScheme=r==="light"?"light":"dark";e.setAttribute("data-theme",r);var m=document.querySelector('meta[name="theme-color"]');if(m){var c=r==="crimson"?"${THEME_COLOR.crimson}":(r==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");m.setAttribute("content",c);}}catch(e){}})();`;
