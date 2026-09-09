/**
 * Mounts the app's query cache and keeps it scoped to the tenant in view.
 *
 * Sits OUTSIDE `ConvexAuthProvider` in the root layout: that provider keeps
 * the element type wrapping the navigation tree stable on purpose (see the
 * placeholder-client note there), and this one never changes shape either.
 *
 * Watching the scoped tenant here means `useAuthStore.clear()` and
 * `enterTenant`/`exitTenant` need no edits: whenever the tenant in scope
 * changes, every other tenant's cache entries are dropped and, with no tenant
 * at all, every realtime channel is closed.
 */

import React, { useEffect } from "react";
import { AppState } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/auth-store";
import { realtimeHub } from "../backends/realtime-hub-singleton";
import { dropCacheForOtherTenants } from "./cache-scope";
import { bindQueryManagersToAppState, queryClient } from "./query-client";

// Same arrangement as the auth-refresh timer in `supabase.ts`: bound once for
// the life of the process, applied immediately.
bindQueryManagersToAppState(AppState, AppState.currentState);

function useCacheScope(): void {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  useEffect(() => {
    dropCacheForOtherTenants(queryClient, realtimeHub, tenantId);
  }, [tenantId]);
}

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  useCacheScope();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
