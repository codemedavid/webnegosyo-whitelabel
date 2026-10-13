/**
 * The Texts screens' reads, on the shared resource cache.
 *
 * One list read feeds the hub, the editor and the Rules tab, so a save in the
 * editor shows on the hub without a manual reload (`invalidate`). The
 * activity feed pages by cursor and lives in its own hook: its pages are
 * appended, not replaced, which the resource cache is not shaped for.
 *
 * The API never throws — refusals come back as `{ok:false, error}` with an
 * owner-ready sentence — so the fetcher turns a refusal into a thrown Error
 * whose message IS that sentence, and the screen shows it as-is.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource, type ResourceResult } from "../query/use-resource";
import { automationsApi, type ActivityItem, type AutomationsView } from "./api";
import { keepsStatus, serverStatusFor, type ActivityFilter } from "./activity";

export const AUTOMATIONS_RESOURCE = "sms-automations";
const LIST_STALE_MS = 30_000;
const ACTIVITY_PAGE = 30;

export interface AutomationsResult extends ResourceResult<AutomationsView> {
  invalidate: () => Promise<void>;
}

export function useAutomationsView(tenantId: string | null, isAllowed = true): AutomationsResult {
  const client = useQueryClient();
  const fetcher = useCallback(async () => {
    const result = await automationsApi.list(tenantId ?? "");
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, [tenantId]);
  const key = tenantId && isAllowed ? resourceKey(AUTOMATIONS_RESOURCE, tenantId) : null;
  const resource = useResource(key, fetcher, { staleTime: LIST_STALE_MS });
  const invalidate = useCallback(async () => {
    if (tenantId) await invalidateResource(client, AUTOMATIONS_RESOURCE, tenantId);
  }, [client, tenantId]);
  return { ...resource, invalidate };
}

export interface ActivityFeed {
  items: ActivityItem[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

interface FeedState {
  items: ActivityItem[];
  cursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

const EMPTY: FeedState = { items: [], cursor: null, isLoading: true, isLoadingMore: false, error: null };

/**
 * Newest first; "Load more" appends the next page. A filter change, or a new
 * `refreshKey` (the list's last read time), starts over.
 */
export function useActivityFeed(
  tenantId: string | null,
  filter: ActivityFilter,
  isActive: boolean,
  refreshKey = 0,
): ActivityFeed {
  const [state, setState] = useState<FeedState>(EMPTY);
  // A reply for a filter the owner already left must not land on the new one.
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const status = serverStatusFor(filter);
      const result = await automationsApi.activity(tenantId ?? "", {
        limit: ACTIVITY_PAGE,
        ...(cursor ? { cursor } : {}),
        ...(status ? { status } : {}),
      });
      if (!result.ok) return { ok: false as const, error: result.error };
      const items = result.value.items.filter((item) => keepsStatus(filter, item.status));
      return { ok: true as const, items, cursor: result.value.nextCursor };
    },
    [tenantId, filter],
  );

  const reload = useCallback(async () => {
    if (!tenantId) return;
    const mine = ++generation.current;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    const page = await fetchPage(null);
    if (mine !== generation.current) return;
    setState(page.ok
      ? { items: page.items, cursor: page.cursor, isLoading: false, isLoadingMore: false, error: null }
      : { ...EMPTY, isLoading: false, error: page.error });
  }, [tenantId, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!state.cursor || state.isLoadingMore) return;
    const mine = generation.current;
    setState((prev) => ({ ...prev, isLoadingMore: true, error: null }));
    const page = await fetchPage(state.cursor);
    if (mine !== generation.current) return;
    setState((prev) => (page.ok
      ? { ...prev, items: [...prev.items, ...page.items], cursor: page.cursor, isLoadingMore: false }
      : { ...prev, isLoadingMore: false, error: page.error }));
  }, [state.cursor, state.isLoadingMore, fetchPage]);

  useEffect(() => {
    if (isActive) void reload();
  }, [isActive, reload, refreshKey]);

  return {
    items: state.items,
    hasMore: state.cursor !== null,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    error: state.error,
    reload,
    loadMore,
  };
}
