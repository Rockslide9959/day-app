"use client";

import { useCallback, useEffect, useState } from "react";
import { AutosaveController, AutosaveStatus } from "@/lib/autosave";

// Thin React wrapper around lib/autosave.ts's framework-agnostic
// controller. Mount a fresh instance per entry by rendering the editor
// with `key={entryId}` from the parent (see app/notebook/[id]/page.tsx) —
// simpler than resetting an in-flight controller mid-life, and it's how
// React already expects per-identity state to be reset. Because of that
// remount-per-entry guarantee, `save`/`onSaved` only need to be captured
// once (in the lazy useState initializer below) rather than kept "fresh"
// via a mutable ref — refs may not be written during render.
export function useAutosave<T>({
  initialValue,
  value,
  save,
  delayMs,
  enabled = true,
  onSaved,
}: {
  // The value already persisted on the server when the editor opened —
  // seeds the controller so opening an entry never triggers an
  // immediate save of its own unchanged content.
  initialValue: T;
  value: T;
  save: (value: T) => Promise<void>;
  delayMs?: number;
  enabled?: boolean;
  onSaved?: (value: T) => void;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("saved");

  const [controller] = useState(() => {
    const c = new AutosaveController<T>({ delayMs, save, onStatusChange: setStatus, onSaved });
    c.markSaved(initialValue);
    return c;
  });

  useEffect(() => {
    if (enabled) controller.notify(value);
  }, [controller, value, enabled]);

  useEffect(() => {
    controller.setOnline(navigator.onLine);
    function goOnline() {
      controller.setOnline(true);
      controller.flush();
    }
    function goOffline() {
      controller.setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [controller]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!controller.hasUnsavedChanges()) return;
      controller.flush();
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Client-side navigation away — flush a trailing debounce. The
      // fetch it kicks off isn't tied to this component's lifecycle, so
      // it still completes after unmount.
      controller.flush();
      controller.dispose();
    };
  }, [controller]);

  const flush = useCallback(() => controller.flush(), [controller]);
  const retry = useCallback(() => controller.retry(), [controller]);

  return { status, flush, retry };
}
