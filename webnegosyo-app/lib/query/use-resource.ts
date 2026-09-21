/**
 * Cached imperative reads (products, inventory, outlets…).
 *
 * The screens' bespoke `useEffect` + `useState` plumbing gets the same cache
 * the platform path uses: one fetch per key however many callers, the app's
 * own result shape, and a mutation-side `invalidateResource` so a save
 * elsewhere shows up without a manual reload. Keys come from `resourceKey`,
 * which carries the tenant so the tenant-switch teardown can find them.
 */

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import { RESOURCE_KEY_ROOT, keyTenant, type ResourceQueryKey } from "../backends/query-keys";
import { resourceSnapshotKey, withOfflineSnapshot } from "../offline/resource-snapshot";

export interface ResourceResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isRefetching: boolean;
  /** When the data last landed (epoch ms); `0` before any successful read. */
  dataUpdatedAt: number;
}

export interface ResourceOptions {
  staleTime?: number;
  /**
   * Keep the last successful answer on disk and serve it when the read fails,
   * so the register can open and sell without a connection. Only for reads
   * the register cannot do without (menu, prices, branches, tables): every
   * other read keeps failing loudly. See `lib/offline/resource-snapshot.ts`.
   */
  offlineSnapshot?: boolean;
}

/** A key nothing observes with a fetcher: a null key disables the read. */
const IDLE_RESOURCE_KEY = [RESOURCE_KEY_ROOT, "idle"] as const;

export function useResource<T>(
  key: ResourceQueryKey | null,
  fetcher: () => Promise<T>,
  options: ResourceOptions = {}
): ResourceResult<T> {
  const isEnabled = key !== null;
  const wantsSnapshot = options.offlineSnapshot === true && key !== null;
  const storageKey = wantsSnapshot ? resourceSnapshotKey(key) : null;
  const queryFn = useCallback(
    () => (storageKey === null ? fetcher() : withOfflineSnapshot(storageKey, fetcher)),
    [storageKey, fetcher]
  );
  const query = useQuery({
    queryKey: key ?? IDLE_RESOURCE_KEY,
    queryFn,
    enabled: isEnabled,
    staleTime: options.staleTime,
  });

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    if (!isEnabled) return;
    await queryRefetch();
  }, [isEnabled, queryRefetch]);

  const error = query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null;

  return {
    data: query.data,
    isLoading: isEnabled ? query.isPending : false,
    error,
    refetch,
    isRefetching: query.isFetching && !query.isPending,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

/** Refetch every active copy of a named resource, for one tenant or all. */
export function invalidateResource(
  client: QueryClient,
  name: string,
  tenantId?: string | null
): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (key[0] !== RESOURCE_KEY_ROOT || key[1] !== name) return false;
      return tenantId == null || keyTenant(key) === tenantId;
    },
  });
}
