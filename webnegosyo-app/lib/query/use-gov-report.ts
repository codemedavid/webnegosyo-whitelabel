/**
 * The Senior & PWD report for one period on the shared cache.
 *
 * Keyed by tenant + period + the window's start, so "This month" read on the
 * 31st and reopened on the 1st is a new question rather than a stale answer.
 * Not snapshotted for offline: a tax report must fail loudly, never show an
 * old month as if it were current.
 */

import { useCallback } from "react";
import type { QueryClient } from "@tanstack/query-core";
import { resourceKey } from "../backends/query-keys";
import { buildGovReport, type GovReport } from "../gov-reports/report";
import type { GovReportPeriod } from "../gov-reports/period";
import { fetchGovLedger } from "../gov-reports/service";
import { photoIdsByGrant } from "../gov-reports/id-photos";
import { invalidateResource, useResource, type ResourceResult } from "./use-resource";

export const GOV_REPORT_RESOURCE = "gov-report";

export interface GovReportData {
  report: GovReport;
  isTruncated: boolean;
  /** Grant id → its optional ID photo's id. */
  photoIdByGrant: Readonly<Record<string, string>>;
}

/** `period` must be memoised by the caller (it is a fetcher dependency). */
export function useGovReport(
  tenantId: string | null,
  period: GovReportPeriod,
): ResourceResult<GovReportData> {
  const fetcher = useCallback(async (): Promise<GovReportData> => {
    const ledger = await fetchGovLedger(tenantId as string, period, Date.now());
    const report = buildGovReport(ledger);
    return {
      report,
      isTruncated: ledger.isTruncated,
      photoIdByGrant: photoIdsByGrant(report.grants, ledger.idPhotos),
    };
  }, [tenantId, period]);
  const key = tenantId ? resourceKey(GOV_REPORT_RESOURCE, tenantId, period.key, period.startIso) : null;
  return useResource<GovReportData>(key, fetcher);
}

export function invalidateGovReport(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResource(client, GOV_REPORT_RESOURCE, tenantId);
}
