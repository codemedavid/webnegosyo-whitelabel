/**
 * The React half of the platform-Supabase read path.
 *
 * Extracted from `lib/hooks.ts` so it is a LEAF module — its only imports are
 * React, the query cache, the supabase client, and the pure backend modules —
 * and can therefore be exercised with `renderHook` without dragging
 * `convex/react` and the auth store into the test. `lib/hooks.ts` remains the
 * only dispatch point; screens never import this file directly.
 *
 * Every instance asking the same question (ref, args, tenant, scope) shares
 * one cache entry, one in-flight fetch and one poll timer; every instance on
 * the same tenant shares one realtime channel (`realtime-hub.ts`). A payload
 * on that channel invalidates the affected keys through `query-invalidation`,
 * where `isOrderChangeInScope` re-checks the branch PER KEY — Realtime allows
 * one filter clause per binding and it is spent on the tenant, so the branch
 * check has nowhere else to happen, and per key is what lets a store-wide
 * alerts watcher and a branch-scoped board share a channel correctly.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { withPlatformTimeout } from "./platform-call";
import { runPlatformQuery, type PlatformClient } from "./supabase-adapter";
import {
  NO_FAILURES,
  countConsecutiveFailures,
  isRefRealtimeBacked,
  resolvePollMs,
  type FailureStreak,
  type RealtimeStatus,
} from "./supabase-realtime";
import {
  SKIPPED_PLATFORM_KEY,
  branchScopeKey,
  parseBranchScopeKey,
  platformQueryKey,
} from "./query-keys";
import { realtimeHub } from "./realtime-hub-singleton";
import { bindRealtimeToQueryClient } from "../query/realtime-bridge";
import { resolveStaleMs, shouldKeepPreviousData } from "../query/query-client";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import type { BranchScope } from "../branch-scope";

export interface SafeQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: string | null;
  /**
   * True when the query failed because the function does not exist on the
   * deployed backend (i.e. the tenant's Convex deployment is running an older
   * bundle that predates this function). Screens use this to show a "needs a
   * backend update" placeholder instead of silently hiding the section.
   */
  isMissingFunction: boolean;
  /** Re-read now; resolves when the read has landed. A no-op for a skipped query. */
  refetch: () => Promise<void>;
  /** A re-read is in flight while data is already showing. */
  isRefetching: boolean;
}

export const platformClient = supabase as unknown as PlatformClient;

const DISCONNECTED: RealtimeStatus = "disconnected";

/** The tenant's channel status, as an external store the cache can poll by. */
function useRealtimeStatus(tenantId: string | null): RealtimeStatus {
  return useSyncExternalStore(realtimeHub.subscribeStatus, () =>
    tenantId ? realtimeHub.getStatus(tenantId) : DISCONNECTED
  );
}

/** Hold the tenant's channel open, and bind the cache to it, while mounted. */
function useRealtimeSubscription(tenantId: string | null, isActive: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => bindRealtimeToQueryClient(realtimeHub, queryClient), [queryClient]);

  useEffect(() => {
    if (!isActive || !tenantId) return;
    return realtimeHub.acquire(tenantId);
  }, [tenantId, isActive]);
}

/**
 * Fetch a function ref from the platform Supabase adapter.
 *
 * Always called (never behind a condition) so the hook order stays identical on
 * every render regardless of which backend a tenant uses; it simply does
 * nothing when `tenantId` is null.
 */
export function usePlatformQuery<T>(
  refName: string,
  args: Record<string, unknown> | "skip" | undefined,
  tenantId: string | null,
  scope: BranchScope
): SafeQueryResult<T> {
  // Screens pass fresh object literals every render, so the object identity
  // changes constantly. Key everything on the serialized args instead.
  const argsKey = JSON.stringify(args ?? {});
  const isSkipped = args === "skip" || !tenantId;

  // The branch is part of what the query asked for: it is in the key, so a
  // session that resolves its branch after the first fetch asks again.
  const scopeKey = branchScopeKey(scope);

  // A new key means the previous data answers a different question — the cache
  // then reports `pending` with no data, so switching store or period never
  // presents the old numbers as the new ones. The same key on remount is
  // served from cache instantly and refreshed in the background.
  const queryKey = useMemo(
    () =>
      isSkipped || !tenantId
        ? SKIPPED_PLATFORM_KEY
        : platformQueryKey(refName, JSON.parse(argsKey), tenantId, parseBranchScopeKey(scopeKey)),
    [refName, argsKey, tenantId, isSkipped, scopeKey]
  );

  // Drawn once per hook instance, never per evaluation: the cache re-reads the
  // interval on every update and re-arms the timer whenever the number
  // changes, so a fresh draw each time would push the retry out forever.
  const jitterSeed = useRef(Math.random()).current;
  // Where the current failure streak started; carried between evaluations.
  const streakRef = useRef<FailureStreak>(NO_FAILURES);

  const isRealtimeBacked = isRefRealtimeBacked(refName);
  useRealtimeSubscription(tenantId, !isSkipped && isRealtimeBacked);
  const realtimeStatus = useRealtimeStatus(tenantId);

  const query = useQuery({
    queryKey,
    enabled: !isSkipped,
    // `tenantId` is non-null whenever this can run: the query is disabled and
    // `refetch` is guarded while skipped.
    queryFn: () => readPlatformRef<T>(refName, JSON.parse(argsKey), tenantId ?? "", scope),
    staleTime: resolveStaleMs(refName),
    // Realtime is the primary path once connected; the poll drops to a slow
    // safety net then, and speeds back up if the socket goes away. Changing the
    // interval re-arms the timer without a fetch. A read that keeps failing
    // waits longer each time: the fleet re-asking a saturated database on the
    // base interval is the loop that kept it saturated.
    refetchInterval: isSkipped
      ? false
      : (query) => {
          const { streak, failures } = countConsecutiveFailures(query.state, streakRef.current);
          streakRef.current = streak;
          return resolvePollMs(realtimeStatus, failures, () => jitterSeed);
        },
    refetchIntervalInBackground: false,
    // Only for refs whose key changes while the screen does not (see
    // `shouldKeepPreviousData`); everything else shows a loading state.
    placeholderData: shouldKeepPreviousData(refName) ? keepPreviousData : undefined,
    // Keeps array identity across unchanged polls, so watchers keyed on data
    // identity do not re-run their joins every 15 s.
    structuralSharing: true,
  });

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    if (isSkipped) return;
    await queryRefetch();
  }, [isSkipped, queryRefetch]);

  useRefetchOnScreenFocus({
    enabled: !isSkipped,
    staleMs: resolveStaleMs(refName),
    dataUpdatedAt: query.dataUpdatedAt,
    isFetching: query.isFetching,
    refetch,
  });

  return toSafeQueryResult(query, isSkipped, refetch);
}

/** One bounded read of a platform ref; failures are logged and rethrown for the cache. */
async function readPlatformRef<T>(
  refName: string,
  args: Record<string, unknown>,
  tenantId: string,
  scope: BranchScope
): Promise<T> {
  try {
    return (await withPlatformTimeout(
      runPlatformQuery(platformClient, tenantId, refName, args, scope),
      refName
    )) as T;
  } catch (e: unknown) {
    console.error("[usePlatformQuery] " + refName + ":", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

function toSafeQueryResult<T>(
  query: UseQueryResult<T>,
  isSkipped: boolean,
  refetch: () => Promise<void>
): SafeQueryResult<T> {
  const error = query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null;
  return {
    data: query.data,
    isLoading: isSkipped ? false : query.isPending,
    error,
    isMissingFunction: false,
    refetch,
    isRefetching: query.isFetching && !query.isPending,
  };
}
