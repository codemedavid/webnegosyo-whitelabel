/**
 * The approvals reads, cached and kept fresh: refetched when the screen comes
 * back into view and when the connection returns, polled every 10 s while a
 * request is still moving (bounded, see polling.ts), and never wiped by a
 * failed refresh — the screens show "Couldn't refresh" over what they had.
 *
 * Every key sits under the `approvals` resource with the tenant, so one
 * invalidation after a write refreshes the inbox, the Home card, the order's
 * status card and the review screen together.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { RESOURCE_KEY_ROOT, resourceKey, type ResourceQueryKey } from "../backends/query-keys";
import { subscribeOnReconnect } from "../query/reconnect";
import { invalidateResource } from "../query/use-resource";
import { useIsScreenFocused, useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { approvalsApi, type ApprovalsApi } from "./api";
import { pollIntervalFor, toApprovalsError, unwrapApiResult, type ApprovalsError } from "./polling";
import type { ApprovalRequestView, ApprovalRules } from "./types";

export const APPROVALS_RESOURCE = "approvals";
const STALE_MS = 15_000;
/** The approver's inbox refreshes on its own while it is in view. */
const INBOX_POLL_MS = 30_000;
const IDLE_KEY = [RESOURCE_KEY_ROOT, "approvals-idle"] as const;

export interface ApprovalsQuery<T> {
  data: T | undefined;
  isLoading: boolean;
  error: ApprovalsError | null;
  /** A refresh failed but earlier data is still on screen. */
  isShowingStale: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
  dataUpdatedAt: number;
}

function useApprovalsQuery<T>(
  key: ResourceQueryKey | null,
  fetcher: () => Promise<T>,
  interval: (data: T | undefined, isFocused: boolean) => number | false,
): ApprovalsQuery<T> {
  const isEnabled = key !== null;
  const isFocused = useIsScreenFocused();
  const query = useQuery({
    queryKey: key ?? IDLE_KEY,
    queryFn: fetcher,
    enabled: isEnabled,
    staleTime: STALE_MS,
    refetchInterval: (current) => (isEnabled ? interval(current.state.data as T | undefined, isFocused) : false),
  });
  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    if (isEnabled) await queryRefetch();
  }, [isEnabled, queryRefetch]);

  useRefetchOnScreenFocus({ enabled: isEnabled, staleMs: STALE_MS, dataUpdatedAt: query.dataUpdatedAt, isFetching: query.isFetching, refetch });
  useEffect(() => (isEnabled ? subscribeOnReconnect(() => void refetch()) : undefined), [isEnabled, refetch]);

  const error = query.error ? toApprovalsError(query.error) : null;
  return {
    data: query.data,
    isLoading: isEnabled && query.isPending,
    error,
    isShowingStale: error !== null && query.data !== undefined,
    isRefetching: query.isFetching && !query.isPending,
    refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

/** Epoch ms this hook started watching — the polling bound counts from here. */
function useStartedAt(): number {
  const [startedAt] = useState(() => Date.now());
  return startedAt;
}

export interface ApprovalList {
  requests: ApprovalRequestView[];
  isApprover: boolean;
}

/** The approver's "To review": pending requests in reach, oldest first (server order). */
export function useApprovalInbox(tenantId: string | null, enabled: boolean, api: ApprovalsApi = approvalsApi): ApprovalsQuery<ApprovalList> {
  const key = tenantId && enabled ? resourceKey(APPROVALS_RESOURCE, tenantId, "pending") : null;
  const fetcher = useCallback(async () => unwrapApiResult(await api.list(tenantId ?? "", "pending")), [api, tenantId]);
  return useApprovalsQuery(key, fetcher, (_, isFocused) => (isFocused ? INBOX_POLL_MS : false));
}

/** Decided in the last 24 h ("Recently decided"). */
export function useRecentApprovals(tenantId: string | null, enabled: boolean, api: ApprovalsApi = approvalsApi): ApprovalsQuery<ApprovalList> {
  const key = tenantId && enabled ? resourceKey(APPROVALS_RESOURCE, tenantId, "recent") : null;
  const fetcher = useCallback(async () => unwrapApiResult(await api.list(tenantId ?? "", "recent")), [api, tenantId]);
  return useApprovalsQuery(key, fetcher, () => false);
}

/** The requester's own requests, polled while any of them is still moving. */
export function useMyApprovalRequests(tenantId: string | null, enabled: boolean, api: ApprovalsApi = approvalsApi): ApprovalsQuery<ApprovalList> {
  const key = tenantId && enabled ? resourceKey(APPROVALS_RESOURCE, tenantId, "mine") : null;
  const startedAt = useStartedAt();
  const fetcher = useCallback(async () => unwrapApiResult(await api.list(tenantId ?? "", "mine")), [api, tenantId]);
  return useApprovalsQuery(key, fetcher, (data, isFocused) =>
    pollIntervalFor(data?.requests ?? [], { isFocused, startedAt, now: Date.now() }),
  );
}

/** One request (the review screen), re-checked on open and polled while it moves. */
export function useApprovalRequest(
  tenantId: string | null,
  approvalId: string | null,
  api: ApprovalsApi = approvalsApi,
): ApprovalsQuery<ApprovalRequestView> {
  const key = tenantId && approvalId ? resourceKey(APPROVALS_RESOURCE, tenantId, "one", approvalId) : null;
  const startedAt = useStartedAt();
  const fetcher = useCallback(
    async () => unwrapApiResult(await api.get(tenantId ?? "", approvalId ?? "")).request,
    [api, tenantId, approvalId],
  );
  return useApprovalsQuery(key, fetcher, (data, isFocused) =>
    pollIntervalFor(data ? [data] : [], { isFocused, startedAt, now: Date.now() }),
  );
}

export interface ApprovalRulesData {
  rules: ApprovalRules;
  approvers: { userId: string; name: string | null; outletId: string | null }[];
  canEdit: boolean;
}

export function useApprovalRules(tenantId: string | null, enabled: boolean, api: ApprovalsApi = approvalsApi): ApprovalsQuery<ApprovalRulesData> {
  const key = tenantId && enabled ? resourceKey(APPROVALS_RESOURCE, tenantId, "rules") : null;
  const fetcher = useCallback(async () => unwrapApiResult(await api.getRules(tenantId ?? "")), [api, tenantId]);
  return useApprovalsQuery(key, fetcher, () => false);
}

/** Refresh every approvals read for this tenant (after any write). */
export function useInvalidateApprovals(tenantId: string | null): () => Promise<void> {
  const client = useQueryClient();
  return useCallback(() => invalidateResource(client, APPROVALS_RESOURCE, tenantId), [client, tenantId]);
}

/** A clock for countdowns, ticking every `intervalMs`. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
