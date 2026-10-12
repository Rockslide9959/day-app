"use client";

import { useEffect, useRef } from "react";

// Fired by Quick Add (components/quickAdd/QuickAddSheet.tsx) whenever it
// creates, changes or undoes something, so whatever page is open can refetch.
export const DATA_CHANGED_EVENT = "day:data-changed";

export function useDataChanged(onChange: () => void) {
  const ref = useRef(onChange);
  useEffect(() => {
    ref.current = onChange;
  });
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, []);
}
