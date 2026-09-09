/**
 * The app's one query cache and its defaults.
 *
 * `retry: false` is mandatory: every platform read is already bounded by the
 * 12 s `withPlatformTimeout`, and v5's default three retries with backoff would
 * stretch a dead connection into a 40 s+ spinner. `networkMode: "always"`
 * keeps a fetch from silently pausing on a phone whose online flag is wrong.
 * Errors stay in the result (`throwOnError: false`) so screens keep showing
 * their own error states instead of tripping the root boundary.
 *
 * Node-importable (no React Native): the AppState binding takes the same
 * `AppStateLike` slice as `supabase-auth-refresh.ts` and is wired up by the
 * provider.
 */

import { QueryClient, focusManager } from "@tanstack/query-core";
import {
  autoRefreshActionFor,
  type AppStateLike,
  type AppStateValue,
} from "../supabase-auth-refresh";

/** How long a platform read is served from cache before a mount refetches it. */
export const PLATFORM_STALE_MS = 10_000;

/** How long an unobserved entry survives, so a revisited tab renders instantly. */
export const PLATFORM_GC_MS = 5 * 60_000;

/** Refs whose payload is heavy enough to deserve a longer stale window. */
const STALE_MS_BY_REF: Readonly<Record<string, number>> = {
  // A 10k-row join; order changes invalidate it anyway.
  "orders:getAllOrderItems": 60_000,
};

export function resolveStaleMs(refName: string): number {
  return STALE_MS_BY_REF[refName] ?? PLATFORM_STALE_MS;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        throwOnError: false,
        staleTime: PLATFORM_STALE_MS,
        gcTime: PLATFORM_GC_MS,
        networkMode: "always",
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
        networkMode: "always",
      },
    },
  });
}

/** Module singleton the provider mounts; tests build their own. */
export const queryClient = createAppQueryClient();

/** The part of TanStack's focus manager this module drives. */
export interface FocusManagerLike {
  setFocused: (focused: boolean) => void;
}

/**
 * Tell the cache when the app is in front of the user, so `refetchOnWindowFocus`
 * fires on foreground and polling pauses in the background. Same rule as the
 * auth-refresh timer: "inactive" counts as away.
 */
export function bindQueryManagersToAppState(
  appState: AppStateLike,
  currentState: AppStateValue,
  focus: FocusManagerLike = focusManager
): void {
  const apply = (state: AppStateValue) => {
    focus.setFocused(autoRefreshActionFor(state) === "start");
  };
  apply(currentState);
  appState.addEventListener("change", apply);
}
