/**
 * Refetch-on-focus for a screen that is already mounted.
 *
 * Tabs mount once and never unmount, so a query's own mount refetch never
 * fires again; the navigator's focus event stands in for it. Only when the
 * data is actually stale, or every tab switch would be a network round trip.
 *
 * `NavigationContext` (rather than `useFocusEffect`) because it reads as
 * undefined outside a navigator, so the hook is a no-op under `renderHook`
 * instead of throwing.
 */

import { useContext, useEffect, useRef } from "react";
import { NavigationContext } from "@react-navigation/native";

export interface FocusRefetchInput {
  enabled: boolean;
  staleMs: number;
  /** `0` when nothing has been fetched yet. */
  dataUpdatedAt: number;
  /** A read already in flight is never restarted by a focus. */
  isFetching: boolean;
  refetch: () => Promise<void>;
}

export interface FocusRefetchDecision {
  dataUpdatedAt: number;
  staleMs: number;
  nowMs: number;
}

export function shouldRefetchOnFocus({ dataUpdatedAt, staleMs, nowMs }: FocusRefetchDecision): boolean {
  // Never fetched (a read that has only ever failed): always worth another try.
  if (dataUpdatedAt === 0) return true;
  return nowMs - dataUpdatedAt > staleMs;
}

export function useRefetchOnScreenFocus(input: FocusRefetchInput): void {
  const navigation = useContext(NavigationContext);

  // The listener reads the latest values without re-subscribing on every
  // render — `dataUpdatedAt` changes on every successful read.
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    if (!navigation || !input.enabled) return;
    return navigation.addListener("focus", () => {
      const { dataUpdatedAt, staleMs, isFetching, refetch } = latest.current;
      if (isFetching) return;
      if (!shouldRefetchOnFocus({ dataUpdatedAt, staleMs, nowMs: Date.now() })) return;
      void refetch();
    });
  }, [navigation, input.enabled]);
}
