/**
 * The Shift & remit rules reads on the shared cache. Keys carry the tenant
 * (`resourceKey`), so the tenant-switch teardown finds them and one
 * `invalidateResource` after a save refreshes every screen that reads them.
 *
 * Kept apart from the pure services so logic tests never load the live
 * Supabase client.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";

import { supabase } from "../supabase";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource, type ResourceResult } from "../query/use-resource";
import { CUTOFF_SCHEDULE_RESOURCE } from "../business-day/schedule-service";
import { fetchCashSettings, type CashDb, type CashSettings } from "./settings";
import { listServicePeriods, type ServicePeriod } from "./service-periods";
import { fetchOrderHours, suggestionWindow, type HourBucket } from "./cutoff-suggestion";
import { listCashReceivers, type CashReceiver } from "./receivers";

/** The signed-in user's session as the cash services' client: RLS and the RPCs run as them. */
export const liveCashDb: CashDb = {
  from: (table) => supabase.from(table),
  rpc: (fn, args) => supabase.rpc(fn, args),
};

export const CASH_SETTINGS_RESOURCE = "cash-settings";
export const SERVICE_PERIODS_RESOURCE = "service-periods";
const ORDER_HOURS_RESOURCE = "cash-order-hours";
const STALE_MS = 60_000;
/** The suggestion is a 30-day picture; an hour-old one is as good as fresh. */
const ORDER_HOURS_STALE_MS = 60 * 60_000;

export function useCashSettings(tenantId: string | null): ResourceResult<CashSettings> {
  const fetcher = useCallback(() => fetchCashSettings(liveCashDb, tenantId as string), [tenantId]);
  return useResource(tenantId ? resourceKey(CASH_SETTINGS_RESOURCE, tenantId) : null, fetcher, { staleTime: STALE_MS });
}

/** Every live shift the caller may read (store-wide and per branch). */
export function useServicePeriods(tenantId: string | null): ResourceResult<ServicePeriod[]> {
  const fetcher = useCallback(() => listServicePeriods(liveCashDb, tenantId as string), [tenantId]);
  return useResource(tenantId ? resourceKey(SERVICE_PERIODS_RESOURCE, tenantId) : null, fetcher, { staleTime: STALE_MS });
}

/** Orders per hour of day over the last 30 days; `enabled` = platform store + `reports`. */
export function useOrderHours(tenantId: string | null, isEnabled: boolean): ResourceResult<HourBucket[]> {
  const fetcher = useCallback(
    () => fetchOrderHours(liveCashDb, tenantId as string, suggestionWindow(Date.now())),
    [tenantId],
  );
  return useResource(isEnabled && tenantId ? resourceKey(ORDER_HOURS_RESOURCE, tenantId) : null, fetcher, {
    staleTime: ORDER_HOURS_STALE_MS,
  });
}

export const CASH_RECEIVERS_RESOURCE = "cash-receivers";

/**
 * Who can receive cash at `outletId` (null = the unbranched store), for Remit
 * to and Taken by. Order the list with `receiversForRemit`.
 */
export function useCashReceivers(tenantId: string | null, outletId: string | null): ResourceResult<CashReceiver[]> {
  const fetcher = useCallback(() => listCashReceivers(liveCashDb, tenantId as string, outletId), [tenantId, outletId]);
  return useResource(tenantId ? resourceKey(CASH_RECEIVERS_RESOURCE, tenantId, outletId) : null, fetcher, {
    staleTime: STALE_MS,
  });
}

export function invalidateCashSettings(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResource(client, CASH_SETTINGS_RESOURCE, tenantId);
}

export function invalidateServicePeriods(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResource(client, SERVICE_PERIODS_RESOURCE, tenantId);
}

/** After a cutoff change: Home, Reports, the Drawer and this screen all read the schedule. */
export function invalidateCutoffSchedule(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResource(client, CUTOFF_SCHEDULE_RESOURCE, tenantId);
}

export interface CashRulesRefresh {
  settings: () => Promise<void>;
  servicePeriods: () => Promise<void>;
  cutoffSchedule: () => Promise<void>;
}

/** The refreshes a screen runs after a save; screens never touch the cache themselves. */
export function useCashRulesRefresh(tenantId: string | null): CashRulesRefresh {
  const client = useQueryClient();
  return useMemo(() => {
    const run = (refresh: (c: QueryClient, t: string) => Promise<void>) => async () => {
      if (tenantId) await refresh(client, tenantId);
    };
    return {
      settings: run(invalidateCashSettings),
      servicePeriods: run(invalidateServicePeriods),
      cutoffSchedule: run(invalidateCutoffSchedule),
    };
  }, [client, tenantId]);
}
