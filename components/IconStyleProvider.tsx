"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  IconStyle,
  ICON_STYLE_STORAGE_KEY,
  readStoredIconStyle,
  writeStoredIconStyle,
} from "@/lib/iconStyle";

// Same useSyncExternalStore pattern as ThemeProvider (see components/ThemeProvider.tsx
// for the full rationale) — avoids a hydration mismatch between the server's
// deterministic default and whatever's actually in this device's localStorage.

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  function onStorage(e: StorageEvent) {
    if (e.key === ICON_STYLE_STORAGE_KEY) onStoreChange();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): IconStyle {
  return readStoredIconStyle();
}

function getServerSnapshot(): IconStyle {
  return "png";
}

type IconStyleContextValue = {
  style: IconStyle;
  setStyle: (style: IconStyle) => void;
};

const IconStyleContext = createContext<IconStyleContextValue | null>(null);

export function IconStyleProvider({ children }: { children: React.ReactNode }) {
  const style = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setStyle = useCallback((next: IconStyle) => {
    writeStoredIconStyle(next);
    notifyListeners();
  }, []);

  const value = useMemo(() => ({ style, setStyle }), [style, setStyle]);

  return <IconStyleContext.Provider value={value}>{children}</IconStyleContext.Provider>;
}

export function useIconStyle(): IconStyleContextValue {
  const ctx = useContext(IconStyleContext);
  if (!ctx) throw new Error("useIconStyle must be used within an IconStyleProvider");
  return ctx;
}
