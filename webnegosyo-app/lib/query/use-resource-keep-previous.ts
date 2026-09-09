/**
 * A keyed read that keeps the previous key's data while the next loads.
 *
 * `useResource` renders a new key as "loading, no data", which is right for a
 * tenant switch and wrong for the daily report's day arrows: every tap blanked
 * the screen, and two quick taps raced their responses. With TanStack's
 * `keepPreviousData` the last day stays on screen, `isPlaceholderData` says
 * so, and only the newest key's response is ever shown.
 *
 * Kept as its own hook rather than an option on `useResource` so the shared
 * hook's contract — new key means no stale cross-identity render — stays
 * exactly what it says.
 */

import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RESOURCE_KEY_ROOT, type ResourceQueryKey } from "../backends/query-keys";
import type { ResourceOptions, ResourceResult } from "./use-resource";

export interface KeepPreviousResult<T> extends ResourceResult<T> {
  /** True while `data` belongs to the previous key. */
  isPlaceholderData: boolean;
}

const IDLE_KEY = [RESOURCE_KEY_ROOT, "idle-keep-previous"] as const;

export function useResourceKeepPrevious<T>(
  key: ResourceQueryKey | null,
  fetcher: () => Promise<T>,
  options: ResourceOptions = {}
): KeepPreviousResult<T> {
  const isEnabled = key !== null;
  const query = useQuery({
    queryKey: key ?? IDLE_KEY,
    queryFn: fetcher,
    enabled: isEnabled,
    staleTime: options.staleTime,
    placeholderData: keepPreviousData,
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
    isPlaceholderData: query.isPlaceholderData,
  };
}
