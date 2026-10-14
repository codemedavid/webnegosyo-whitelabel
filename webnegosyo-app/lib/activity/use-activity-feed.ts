/**
 * The Activity feed's read: cached, paged by keyset, refreshed when it should
 * be (screen focus, the connection coming back), and honest when a refresh
 * fails — the rows already shown stay, with `isShowingStale` so the screen can
 * say "Couldn't refresh. Showing what we had at 12:41 PM." (spec §3 shared
 * states). Never wipes cached rows on an error.
 *
 * The RPC client is injected (lib/activity/activity-client.ts in the app) so
 * this hook never imports the live Supabase client and tests can script it.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { resourceKey } from "../backends/query-keys";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import {
  ACTIVITY_PAGE_SIZE,
  fetchActivityPage,
  isActivityUnavailable,
  type ActivityCursor,
  type ActivityPage,
  type ActivityQuery,
  type ActivityRpcClient,
} from "./activity-repo";
import type { StoreActivityEvent } from "./store-event";

export const ACTIVITY_FEED_RESOURCE = "store-activity";
/** A feed is a log, not a live queue: a 30 s cache keeps tab switches free. */
const FEED_STALE_MS = 30_000;

export type ActivityFeedQuery = Omit<ActivityQuery, "cursor" | "limit">;

export interface UseActivityFeedOptions {
  client: ActivityRpcClient;
  pageSize?: number;
  /** From the app's connectivity belief; a false → true flip refetches. */
  isOnline?: boolean;
}

export interface ActivityFeedResult {
  events: StoreActivityEvent[];
  isLoading: boolean;
  error: string | null;
  /** The database has no activity functions yet (migration not applied). */
  isUnavailable: boolean;
  /** A refresh failed but earlier rows are still on screen. */
  isShowingStale: boolean;
  isRefetching: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => Promise<void>;
  dataUpdatedAt: number;
}

/** Refetch once when `isOnline` flips from false to true. */
export function useRefetchOnReconnect(isOnline: boolean | undefined, refetch: () => Promise<void>): void {
  const wasOnline = useRef(isOnline);
  useEffect(() => {
    const previous = wasOnline.current;
    wasOnline.current = isOnline;
    if (previous === false && isOnline === true) void refetch();
  }, [isOnline, refetch]);
}

export function useActivityFeed(query: ActivityFeedQuery | null, options: UseActivityFeedOptions): ActivityFeedResult {
  const { client, isOnline } = options;
  const pageSize = options.pageSize ?? ACTIVITY_PAGE_SIZE;
  const isEnabled = query !== null && query.tenantId !== "";
  const key = useMemo(
    () => resourceKey(ACTIVITY_FEED_RESOURCE, query?.tenantId ?? null, JSON.stringify(query ?? {}), pageSize),
    [query, pageSize],
  );

  const result = useInfiniteQuery({
    queryKey: key,
    enabled: isEnabled,
    staleTime: FEED_STALE_MS,
    initialPageParam: null as ActivityCursor | null,
    queryFn: ({ pageParam }): Promise<ActivityPage> =>
      fetchActivityPage(client, { ...(query as ActivityFeedQuery), cursor: pageParam, limit: pageSize }),
    getNextPageParam: (last: ActivityPage) => last.nextCursor ?? undefined,
  });

  const { refetch: queryRefetch, fetchNextPage: queryFetchNext, hasNextPage, isFetchingNextPage } = result;
  const refetch = useCallback(async () => {
    if (!isEnabled) return;
    await queryRefetch();
  }, [isEnabled, queryRefetch]);
  const fetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void queryFetchNext();
  }, [hasNextPage, isFetchingNextPage, queryFetchNext]);

  useRefetchOnScreenFocus({
    enabled: isEnabled,
    staleMs: FEED_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isFetching,
    refetch,
  });
  useRefetchOnReconnect(isOnline, refetch);

  const events = useMemo(() => {
    const seen = new Set<string>();
    return (result.data?.pages ?? []).flatMap((page) =>
      page.events.filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      }),
    );
  }, [result.data]);

  const error = result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null;

  return {
    events,
    isLoading: isEnabled ? result.isPending : false,
    error,
    isUnavailable: isActivityUnavailable(result.error),
    isShowingStale: error !== null && result.data !== undefined,
    isRefetching: result.isFetching && !result.isPending && !isFetchingNextPage,
    hasNextPage: hasNextPage === true,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    dataUpdatedAt: result.dataUpdatedAt,
  };
}
