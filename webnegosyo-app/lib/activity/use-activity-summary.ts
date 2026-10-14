/**
 * The Summary tab's reads, and one order's history for the order screen.
 *
 * Summary = the period's totals + the trailing baseline (the store's and each
 * person's "usually") + the period's order and cash rows, which carry what the
 * totals cannot: how much was paid before each cancel, and each drawer count.
 * Those rows are one bounded page; `isRowsPartial` marks sums from them as
 * floors rather than pretending a 101st row does not exist.
 */

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { resourceKey } from "../backends/query-keys";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import {
  ACTIVITY_MAX_PAGE_SIZE,
  fetchActivityPage,
  fetchActivitySummary,
  isActivityUnavailable,
  type ActivityRpcClient,
} from "./activity-repo";
import type { StoreActivityEvent, StoreActivitySummary } from "./store-event";
import type { ActivitySubjectType } from "./taxonomy";

const SUMMARY_STALE_MS = 60_000;
/** The order's history starts a little before it was placed (clock skew). */
const ORDER_HISTORY_LEAD_MS = 60 * 60 * 1000;

export interface ActivitySummaryParams {
  tenantId: string;
  since: string;
  until: string;
  /** Start of the trailing baseline; it runs to `until`. */
  baselineSince: string;
  outletId: string | null;
}

export interface ActivitySummaryResult {
  current: StoreActivitySummary | undefined;
  baseline: StoreActivitySummary | undefined;
  rows: StoreActivityEvent[];
  isRowsPartial: boolean;
  isLoading: boolean;
  error: string | null;
  isUnavailable: boolean;
  refetch: () => Promise<void>;
  dataUpdatedAt: number;
}

interface HookOptions {
  client: ActivityRpcClient;
}

function message(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

export function useActivitySummary(params: ActivitySummaryParams | null, { client }: HookOptions): ActivitySummaryResult {
  const isEnabled = params !== null && params.tenantId !== "";
  const tenant = params?.tenantId ?? null;
  const scope = params ? [params.since, params.until, params.outletId] : [];

  const current = useQuery({
    queryKey: resourceKey("store-activity-summary", tenant, ...scope),
    enabled: isEnabled,
    staleTime: SUMMARY_STALE_MS,
    queryFn: () =>
      fetchActivitySummary(client, { tenantId: tenant ?? "", since: params?.since ?? "", until: params?.until ?? "", outletId: params?.outletId }),
  });
  const baseline = useQuery({
    queryKey: resourceKey("store-activity-baseline", tenant, params?.baselineSince ?? null, ...scope),
    enabled: isEnabled,
    staleTime: SUMMARY_STALE_MS * 10,
    queryFn: () =>
      fetchActivitySummary(client, {
        tenantId: tenant ?? "",
        since: params?.baselineSince ?? "",
        until: params?.until ?? "",
        outletId: params?.outletId,
      }),
  });
  const rows = useQuery({
    queryKey: resourceKey("store-activity-summary-rows", tenant, ...scope),
    enabled: isEnabled,
    staleTime: SUMMARY_STALE_MS,
    queryFn: () =>
      fetchActivityPage(client, {
        tenantId: tenant ?? "",
        since: params?.since,
        until: params?.until,
        outletId: params?.outletId,
        categories: ["orders", "cash"],
        limit: ACTIVITY_MAX_PAGE_SIZE,
      }),
  });

  const { refetch: refetchCurrent } = current;
  const { refetch: refetchBaseline } = baseline;
  const { refetch: refetchRows } = rows;
  const refetch = useCallback(async () => {
    if (!isEnabled) return;
    await Promise.all([refetchCurrent(), refetchBaseline(), refetchRows()]);
  }, [isEnabled, refetchCurrent, refetchBaseline, refetchRows]);

  useRefetchOnScreenFocus({
    enabled: isEnabled,
    staleMs: SUMMARY_STALE_MS,
    dataUpdatedAt: current.dataUpdatedAt,
    isFetching: current.isFetching,
    refetch,
  });

  // The baseline is a comparison, not the answer: its failure costs "usually",
  // never the screen.
  const firstError = current.error ?? rows.error;
  return {
    current: current.data,
    baseline: baseline.data,
    rows: rows.data?.events ?? [],
    isRowsPartial: rows.data?.nextCursor != null,
    isLoading: isEnabled && (current.isPending || rows.isPending),
    error: message(firstError),
    isUnavailable: isActivityUnavailable(firstError),
    refetch,
    dataUpdatedAt: current.dataUpdatedAt,
  };
}

export interface OrderActivityParams {
  tenantId: string;
  orderId: string;
  /** When the order was placed; bounds the read so it stays indexed. */
  placedAt: string | null;
}

export interface SubjectActivityParams {
  tenantId: string;
  subjectType: ActivitySubjectType;
  subjectRef: string;
  /** Lower bound of the read; null reads the newest page. */
  since: string | null;
}

export interface SubjectActivityResult {
  events: StoreActivityEvent[];
  isLoading: boolean;
  error: string | null;
  isUnavailable: boolean;
  refetch: () => Promise<void>;
}

function historySince(placedAt: string | null): string | null {
  const ms = placedAt ? Date.parse(placedAt) : Number.NaN;
  return Number.isNaN(ms) ? null : new Date(ms - ORDER_HISTORY_LEAD_MS).toISOString();
}

/** Everything recorded about one subject (an order, an ingredient…), routine included. */
export function useSubjectActivity(params: SubjectActivityParams | null, { client }: HookOptions): SubjectActivityResult {
  const isEnabled = params !== null && params.tenantId !== "" && params.subjectRef !== "";
  const query = useQuery({
    queryKey: resourceKey("store-activity-subject", params?.tenantId ?? null, params?.subjectType ?? null, params?.subjectRef ?? null, params?.since ?? null),
    enabled: isEnabled,
    staleTime: SUMMARY_STALE_MS / 2,
    queryFn: () =>
      fetchActivityPage(client, {
        tenantId: params?.tenantId ?? "",
        subjectType: params?.subjectType ?? null,
        subjectRef: params?.subjectRef ?? "",
        includeRoutine: true,
        since: params?.since ?? null,
        limit: ACTIVITY_MAX_PAGE_SIZE,
      }),
  });
  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    if (isEnabled) await queryRefetch();
  }, [isEnabled, queryRefetch]);
  return {
    events: query.data?.events ?? [],
    isLoading: isEnabled && query.isPending,
    error: message(query.error),
    isUnavailable: isActivityUnavailable(query.error),
    refetch,
  };
}

/** One order's story for the order screen, bounded by when it was placed. */
export function useOrderActivity(params: OrderActivityParams | null, options: HookOptions): SubjectActivityResult {
  return useSubjectActivity(
    params ? { tenantId: params.tenantId, subjectType: "order", subjectRef: params.orderId, since: historySince(params.placedAt) } : null,
    options,
  );
}
