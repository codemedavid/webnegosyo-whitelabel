/**
 * A clock that ticks.
 *
 * Anything derived from "now" — which business day is the latest, whether a
 * forward arrow is dead — must be derived from a value that moves, or a tab
 * left open past midnight keeps yesterday's idea of today.
 */

import { useEffect, useState } from "react";

export const MINUTE_MS = 60_000;

export function useNowMs(intervalMs: number = MINUTE_MS): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return nowMs;
}
