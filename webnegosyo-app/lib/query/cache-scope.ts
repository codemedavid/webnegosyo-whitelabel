/**
 * The cache never outlives the tenant it was filled for.
 *
 * A superadmin switching stores, or anyone signing out, must not see the
 * previous tenant's rows flash before the new fetch lands, and must not leave
 * a realtime channel bound to a store nobody is looking at. Keys carry their
 * tenant (see `query-keys.ts`), so this is a predicate over the cache rather
 * than an edit to every sign-out and impersonation path.
 *
 * Pure: the provider (`QueryProvider.tsx`) watches the scoped tenant and calls
 * this with the singletons.
 */

import type { QueryClient } from "@tanstack/query-core";
import { keyTenant } from "../backends/query-keys";

/** The slice of the realtime hub a tenant change needs. */
export interface CacheScopeHub {
  teardownAll: () => void;
}

export function dropCacheForOtherTenants(
  client: QueryClient,
  hub: CacheScopeHub,
  currentTenantId: string | null
): void {
  client.removeQueries({
    predicate: (query) => {
      const tenant = keyTenant(query.queryKey);
      return tenant !== null && tenant !== currentTenantId;
    },
  });
  // No tenant in scope means no screen may hold a channel open either.
  if (currentTenantId === null) hub.teardownAll();
}
