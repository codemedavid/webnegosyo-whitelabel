/**
 * A report read on the shared cache, as the signed-in user. Keyed on the
 * tenant and the whole query, so a period, comparison or branch change
 * re-reads and the tenant-switch teardown drops it; re-read on focus when
 * stale. A passing failure is THROWN, so a failed refresh keeps the last
 * figures on screen; a refusal is an answer and is returned.
 */

import { useCallback } from "react";

import { resourceKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { fetchReport, type ReportFetchResult } from "./client";
import type { ReportQuery } from "./types";

export const SALES_REPORT_RESOURCE = "sales-report";
const SALES_REPORT_STALE_MS = 60_000;

export type SettledReport = Extract<ReportFetchResult, { ok: true }> | Extract<ReportFetchResult, { ok: false }>;

/** Refusals are answers; a read that merely failed is thrown (keeps the old figures). */
export function settleReport(result: ReportFetchResult): SettledReport {
  if (!result.ok && (result.reason === "unavailable" || result.reason === "rate_limited")) throw new Error(result.message);
  return result;
}

export function useSalesReport(query: ReportQuery | null) {
  const serialized = query ? JSON.stringify(query) : null;
  const fetcher = useCallback(
    async () => settleReport(await fetchReport(JSON.parse(serialized as string) as ReportQuery)),
    [serialized],
  );
  const result = useResource<SettledReport>(
    query ? resourceKey(SALES_REPORT_RESOURCE, query.tenantId, serialized) : null,
    fetcher,
    { staleTime: SALES_REPORT_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: query !== null,
    staleMs: SALES_REPORT_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });
  return result;
}
