"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  ThemePreference,
  ResolvedTheme,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  readStoredThemePreference,
  resolveTheme,
  systemPrefersDark,
  writeStoredThemePreference,
} from "@/lib/theme";

// Two tiny external stores (localStorage's day:theme, and the OS's
// prefers-color-scheme) read via useSyncExternalStore rather than a manual
// useEffect+setState. That's not just style — a manual effect can't safely
// read localStorage/matchMedia during its first pass without either causing
// a hydration mismatch (client's real value vs. the server's "nothing to
// read") or a synchronous setState-in-effect. useSyncExternalStore is built
// for exactly this: getServerSnapshot supplies the deterministic default
// used for SSR and the first client render, then it swaps in the real
// value right after, as a normal subscription-driven update.

const preferenceListeners = new Set<() => void>();

function notifyPreferenceListeners() {
  preferenceListeners.forEach((listener) => listener());
}

// storage events only fire in *other* tabs than the one that wrote the
// value — this tab's own writes go through notifyPreferenceListeners()
// directly (see setPreference below), so together these cover both cases.
function subscribePreference(onStoreChange: () => void) {
  preferenceListeners.add(onStoreChange);
  function onStorage(e: StorageEvent) {
    if (e.key === THEME_STORAGE_KEY) onStoreChange();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    preferenceListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getPreferenceSnapshot(): ThemePreference {
  return readStoredThemePreference();
}

function getPreferenceServerSnapshot(): ThemePreference {
  return "system";
}

function subscribeSystemDark(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSystemDarkServerSnapshot(): boolean {
  return false;
}

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot
  );
  // systemPrefersDark() only actually affects resolveTheme's output when
  // preference === "system" — so subscribing unconditionally here (rather
  // than tearing the listener down for an explicit Light/Dark choice) is
  // still correct: a later OS change simply has nothing to influence.
  const systemDark = useSyncExternalStore(subscribeSystemDark, systemPrefersDark, getSystemDarkServerSnapshot);

  const resolvedTheme = useMemo(() => resolveTheme(preference, systemDark), [preference, systemDark]);

  // A plain DOM side effect, not a React state update — applyResolvedTheme
  // only mutates the live document (class/color-scheme/meta tag) to match
  // what's already been resolved above.
  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredThemePreference(next);
    notifyPreferenceListeners();
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
