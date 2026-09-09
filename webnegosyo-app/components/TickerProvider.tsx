import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * One shared clock for every card on a list.
 *
 * Timers ("4m", "12m ago", the late accent) need a "now" that moves. Held in
 * the list's own state, every tick re-rendered the whole list — header, strip,
 * every row. Held here, only the components that read the clock re-render;
 * a memoised row above them stays put and the list itself never notices.
 *
 * `useTickerNow` falls back to the wall clock with no provider, so a card
 * renders correctly standalone (tests, the dashboard's compact rows).
 */

/** Twice a minute: a chit clock does not need seconds. */
export const DEFAULT_TICK_MS = 30_000;

const TickerContext = createContext<number | null>(null);

interface TickerProviderProps {
  intervalMs?: number;
  children: ReactNode;
}

export function TickerProvider({ intervalMs = DEFAULT_TICK_MS, children }: TickerProviderProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return <TickerContext.Provider value={nowMs}>{children}</TickerContext.Provider>;
}

/** The shared "now", or the wall clock when rendered outside a provider. */
export function useTickerNow(): number {
  const nowMs = useContext(TickerContext);
  return nowMs ?? Date.now();
}
