/**
 * The Order History item summary on the shared cache. Platform stores only
 * (the caller decides — `resolveItemSummaryAccess`); the read runs as the
 * signed-in user through `fetchItemSummary`. A passing failure is THROWN so
 * the cache keeps the last good figures on a refresh; a refusal (permission,
 * range) is a result the panel says in words.
 *
 * The key carries the tenant (the tenant-switch teardown finds it), the
 * window and the branch.
 */

import { useCallback } from "react";

import { resourceKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { liveItemSummaryClient } from "./item-summary-client";
import { fetchItemSummary, type ItemSummary, type ItemSummaryFetch, type ItemSummaryRequest } from "./item-summary";

export const ITEM_SUMMARY_RESOURCE = "item-summary";
const ITEM_SUMMARY_STALE_MS = 60_000;

export type ItemSummaryViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unavailable" }
  | { kind: "ready"; summary: ItemSummary; staleNotice?: string | null };

export interface ItemSummaryRead {
  state: ItemSummaryViewState;
  refetch: () => Promise<void>;
}

function settle(result: ItemSummaryFetch): ItemSummaryFetch {
  if (!result.ok && result.kind === "failed") throw new Error(result.message);
  return result;
}

/** `request` null = not reading (live queue, no access, or not a platform store). */
export function useItemSummary(request: ItemSummaryRequest | null): ItemSummaryRead {
  const params = request
    ? [request.startMs, request.endMs, request.outletId ?? (request.isUnassigned ? "unassigned" : "all")]
    : null;
  const paramsKey = params ? JSON.stringify(params) : "";
  const fetcher = useCallback(async () => {
    if (!request) throw new Error("No period picked.");
    return settle(await fetchItemSummary(request, liveItemSummaryClient));
    // The request object is rebuilt every render; its params decide the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.tenantId, paramsKey]);

  const result = useResource<ItemSummaryFetch>(
    request && params ? resourceKey(ITEM_SUMMARY_RESOURCE, request.tenantId, ...params) : null,
    fetcher,
    { staleTime: ITEM_SUMMARY_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: request !== null,
    staleMs: ITEM_SUMMARY_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });

  return { state: toViewState(result.data, result.error), refetch: result.refetch };
}

export function toViewState(data: ItemSummaryFetch | undefined, error: string | null): ItemSummaryViewState {
  if (data?.ok) {
    return { kind: "ready", summary: data.summary, staleNotice: error ? "Couldn’t refresh. These are the last figures read." : null };
  }
  if (data && !data.ok) return { kind: "error", message: data.message };
  if (error) return { kind: "error", message: error };
  return { kind: "loading" };
}
