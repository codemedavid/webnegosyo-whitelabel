/**
 * "Missing from sales book" for one period on the shared cache (see
 * `gov-reports/missing.ts`). Keyed like the report, so it refreshes with it.
 */

import { useCallback } from "react";
import { resourceKey } from "../backends/query-keys";
import type { GovReportPeriod } from "../gov-reports/period";
import { fetchMissingFromBook, type MissingOrder } from "../gov-reports/missing";
import { useResource, type ResourceResult } from "./use-resource";

export const GOV_MISSING_RESOURCE = "gov-missing";

/** `period` must be memoised by the caller (it is a fetcher dependency). */
export function useGovMissing(tenantId: string | null, period: GovReportPeriod): ResourceResult<MissingOrder[]> {
  const fetcher = useCallback(() => fetchMissingFromBook(tenantId as string, period), [tenantId, period]);
  const key = tenantId ? resourceKey(GOV_MISSING_RESOURCE, tenantId, period.key, period.startIso) : null;
  return useResource<MissingOrder[]>(key, fetcher);
}
