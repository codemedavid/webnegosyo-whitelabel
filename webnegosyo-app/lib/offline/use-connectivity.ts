/**
 * React bindings for the connectivity belief (`connectivity.ts`).
 *
 * `useConnectivity` reads it; `useConnectivityWatch` keeps it honest while
 * the till is idle: a bounded health probe against the platform's auth
 * service on every foreground and, while the belief is not "online", every
 * `PROBE_INTERVAL_MS`. While online nothing runs — ordinary traffic reports
 * its own outcomes, so a busy register costs no extra requests.
 *
 * Mounted once, in the (main) layout.
 */

import { useEffect, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabaseAnonKey, supabaseUrl } from "../supabase";
import {
  PROBE_INTERVAL_MS,
  getConnectivity,
  probeReachability,
  reportOffline,
  reportOnline,
  shouldPollReachability,
  subscribeConnectivity,
  type ConnectivityState,
} from "./connectivity";

export function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity, getConnectivity);
}

/** GoTrue's health endpoint: tiny, unauthenticated, always present. */
function healthUrl(): string {
  return `${supabaseUrl}/auth/v1/health`;
}

async function probeOnce(): Promise<void> {
  if (!supabaseUrl) return;
  const reachable = await probeReachability({
    url: healthUrl(),
    headers: { apikey: supabaseAnonKey },
  });
  if (reachable) reportOnline();
  else reportOffline();
}

export function useConnectivityWatch(): void {
  const { status } = useConnectivity();

  // Foreground: the connection may have changed while the app was away.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active") void probeOnce();
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, []);

  // Idle offline till: ask every so often whether the connection is back.
  useEffect(() => {
    if (!shouldPollReachability(status)) return;
    const timer = setInterval(() => void probeOnce(), PROBE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status]);
}
