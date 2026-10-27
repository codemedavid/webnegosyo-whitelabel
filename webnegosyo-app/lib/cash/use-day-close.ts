/**
 * Day close reads on the shared cache (keys carry the tenant), and the one
 * refresh a write runs: the day's status, the history, the inbox and the Home
 * strip all move together.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { resourceKey } from "../backends/query-keys";
import { previousBusinessDayKey } from "../daily-report/business-day";
import { invalidateResource, useResource, type ResourceResult } from "../query/use-resource";
import { getDayCloseStatus, listDayCloses, type DayCloseRecord, type DayCloseStatus } from "./day-close";
import { liveCashDb } from "./use-cash-rules";
import { REMITTANCES_RESOURCE } from "./use-remittances";

export const DAY_CLOSE_STATUS_RESOURCE = "cash-day-close-status";
export const DAY_CLOSES_RESOURCE = "cash-day-closes";
const STALE_MS = 15_000;

export function useDayCloseStatus(
  tenantId: string | null,
  outletId: string | null,
  dayKey: string | null,
  isEnabled: boolean,
): ResourceResult<DayCloseStatus> {
  const fetcher = useCallback(
    () => getDayCloseStatus(liveCashDb, tenantId as string, outletId, dayKey as string),
    [tenantId, outletId, dayKey],
  );
  return useResource(
    isEnabled && tenantId && dayKey ? resourceKey(DAY_CLOSE_STATUS_RESOURCE, tenantId, outletId ?? "store", dayKey) : null,
    fetcher,
    { staleTime: STALE_MS },
  );
}

export function useDayCloses(tenantId: string | null, isEnabled: boolean): ResourceResult<DayCloseRecord[]> {
  const fetcher = useCallback(() => listDayCloses(liveCashDb, tenantId as string), [tenantId]);
  return useResource(isEnabled && tenantId ? resourceKey(DAY_CLOSES_RESOURCE, tenantId) : null, fetcher, { staleTime: STALE_MS });
}

/**
 * The day a receiver should close next: yesterday's business day while it is
 * open and had shifts (the usual morning after), otherwise today's.
 */
export function useDayToClose(
  tenantId: string | null,
  outletId: string | null,
  todayKey: string,
  isEnabled: boolean,
): { dayKey: string; status: DayCloseStatus | null } {
  const yesterdayKey = previousBusinessDayKey(todayKey);
  const yesterday = useDayCloseStatus(tenantId, outletId, yesterdayKey, isEnabled);
  const isYesterdayOpen =
    yesterday.data !== undefined &&
    yesterday.data.existingClose?.status !== "closed" &&
    (yesterday.data.preview?.shifts.length ?? 0) + yesterday.data.openShifts.length > 0;
  const today = useDayCloseStatus(tenantId, outletId, todayKey, isEnabled && yesterday.data !== undefined && !isYesterdayOpen);
  return useMemo(
    () => (isYesterdayOpen ? { dayKey: yesterdayKey, status: yesterday.data ?? null } : { dayKey: todayKey, status: today.data ?? null }),
    [isYesterdayOpen, yesterdayKey, todayKey, yesterday.data, today.data],
  );
}

export function useDayCloseRefresh(tenantId: string | null): () => Promise<void> {
  const client = useQueryClient();
  return useMemo(
    () => async () => {
      if (!tenantId) return;
      await Promise.all(
        [DAY_CLOSE_STATUS_RESOURCE, DAY_CLOSES_RESOURCE, REMITTANCES_RESOURCE].map((name) => invalidateResource(client, name, tenantId)),
      );
    },
    [client, tenantId],
  );
}
