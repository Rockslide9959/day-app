"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { todayStr } from "@/lib/dates";

// Keeps "today" in sync with the wall clock for components that can stay
// mounted across a date rollover (a left-open tab, a backgrounded PWA).
// Polled rather than scheduled exactly at midnight so a laptop sleep/wake
// or a system clock change also self-corrects on the next check, and
// re-checked on visibilitychange so returning to the tab doesn't wait for
// the interval.
export function useTodayStr(): string {
  const [today, setToday] = useState(todayStr);

  useEffect(() => {
    const check = () =>
      setToday((prev) => {
        const next = todayStr();
        return next === prev ? prev : next;
      });
    check();
    const id = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return today;
}

// A date-picker state that defaults to today and stays there as real time
// passes — but only while the user hasn't navigated away from today. Once
// they page to a different day, further rollovers just update what
// "today" means for the next jump rather than yanking their view forward.
export function useSyncedDate(): [string, Dispatch<SetStateAction<string>>] {
  const liveToday = useTodayStr();
  const [date, setDate] = useState(liveToday);
  const prevTodayRef = useRef(liveToday);

  useEffect(() => {
    if (liveToday !== prevTodayRef.current) {
      setDate((d) => (d === prevTodayRef.current ? liveToday : d));
      prevTodayRef.current = liveToday;
    }
  }, [liveToday]);

  return [date, setDate];
}
