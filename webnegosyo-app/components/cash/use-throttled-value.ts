import { useEffect, useRef, useState } from "react";

/** The running total is announced at most once per 1.5 s (06 §5). */
export const ANNOUNCE_EVERY_MS = 1500;

/**
 * `value`, but changing at most once per `intervalMs`: the first change shows
 * at once, a burst of key presses after it lands once, on the trailing edge.
 * Feeds a polite live region so a screen reader isn't read every digit.
 */
export function useThrottledValue<T>(value: T, intervalMs: number = ANNOUNCE_EVERY_MS): T {
  const [shown, setShown] = useState(value);
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Object.is(value, shown)) return undefined;
    const wait = Math.max(0, lastAt.current + intervalMs - Date.now());
    timer.current = setTimeout(() => {
      lastAt.current = Date.now();
      setShown(value);
    }, wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, shown, intervalMs]);

  return shown;
}
