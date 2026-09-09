/**
 * The Customers tab on the shared cache.
 *
 * Two named resources: the guest directory (the list plus the numbers that
 * must never be texted) and, where the platform can send at all, the campaign
 * due-states. The tab never unmounts, so returning to it asks
 * `refetchIfStale` rather than reloading unconditionally on every focus.
 *
 * Consent and opt-out toggles patch the cached list optimistically and hand
 * the caller the means to put it back.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import { listCustomers, listSuppressedPhones } from "../sms/customers-repo";
import { lastRunAtByCampaign, listCampaignRows, toScheduledCampaign } from "../sms/campaigns-repo";
import { computeCampaignDueStates, type CampaignDueState } from "../sms/due-runs";
import type { SmsCustomer } from "../sms/types";
import { resourceKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import { invalidateResources, setResourceData } from "../query/resource-cache";
import { shouldRefetchOnFocus } from "../query/use-screen-focus";

export const CUSTOMERS_DIRECTORY_RESOURCE = "customers-directory";
export const CAMPAIGN_STATES_RESOURCE = "campaign-states";

/** A guest list on a tab switch is fine ten seconds old; a pull re-reads it. */
const DIRECTORY_STALE_MS = 10_000;

const NO_CUSTOMERS: SmsCustomer[] = [];
const NO_PHONES: string[] = [];
const NO_STATES: CampaignDueState[] = [];

export interface CustomersDirectory {
  customers: SmsCustomer[];
  suppressedPhones: string[];
}

export interface CustomersDirectoryOptions {
  /** False where the platform cannot send: the campaign reads never happen. */
  withCampaigns: boolean;
  staleMs?: number;
}

export interface CustomersDirectoryResult {
  customers: SmsCustomer[];
  suppressedPhones: string[];
  campaignStates: CampaignDueState[];
  /** True until the directory's first response, success or failure. */
  isLoading: boolean;
  error: string | null;
  /** Pull-to-refresh: every read the tab holds. */
  refetchAll: () => Promise<void>;
  /** Focus: re-read only when what is on screen is older than the stale window. */
  refetchIfStale: (nowMs: number) => void;
  /** Optimistic patch of one guest; a no-op before the first read. */
  patchCustomer: (id: string, updater: (customer: SmsCustomer) => SmsCustomer) => void;
}

export async function fetchCustomersDirectory(tenantId: string): Promise<CustomersDirectory> {
  const [customers, suppressedPhones] = await Promise.all([
    listCustomers(tenantId),
    listSuppressedPhones(tenantId),
  ]);
  return { customers, suppressedPhones };
}

export async function fetchCampaignDueStates(tenantId: string): Promise<CampaignDueState[]> {
  const [rows, lastRuns] = await Promise.all([
    listCampaignRows(tenantId),
    lastRunAtByCampaign(tenantId),
  ]);
  return computeCampaignDueStates(
    rows.map((row) => toScheduledCampaign(row, lastRuns[row.id] ?? null)),
    new Date()
  );
}

/** After a consent write, a suppression, or a campaign save or send. */
export function invalidateCustomers(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResources(client, [CUSTOMERS_DIRECTORY_RESOURCE, CAMPAIGN_STATES_RESOURCE], tenantId);
}

export function useCustomersDirectory(
  tenantId: string | null,
  { withCampaigns, staleMs = DIRECTORY_STALE_MS }: CustomersDirectoryOptions
): CustomersDirectoryResult {
  const client = useQueryClient();

  const directoryKey = tenantId ? resourceKey(CUSTOMERS_DIRECTORY_RESOURCE, tenantId) : null;
  const fetchDirectory = useCallback(() => fetchCustomersDirectory(tenantId as string), [tenantId]);
  const directory = useResource<CustomersDirectory>(directoryKey, fetchDirectory, { staleTime: staleMs });

  const campaignsKey = tenantId && withCampaigns ? resourceKey(CAMPAIGN_STATES_RESOURCE, tenantId) : null;
  const fetchCampaigns = useCallback(() => fetchCampaignDueStates(tenantId as string), [tenantId]);
  const campaigns = useResource<CampaignDueState[]>(campaignsKey, fetchCampaigns, { staleTime: staleMs });

  const refetchAll = useCallback(async () => {
    await Promise.all([directory.refetch(), campaigns.refetch()]);
  }, [directory.refetch, campaigns.refetch]);

  const isFetching = directory.isLoading || directory.isRefetching;
  const { dataUpdatedAt } = directory;
  const refetchIfStale = useCallback(
    (nowMs: number) => {
      if (isFetching) return;
      if (!shouldRefetchOnFocus({ dataUpdatedAt, staleMs, nowMs })) return;
      void refetchAll();
    },
    [isFetching, dataUpdatedAt, staleMs, refetchAll]
  );

  const patchCustomer = useCallback(
    (id: string, updater: (customer: SmsCustomer) => SmsCustomer) => {
      if (!directoryKey) return;
      setResourceData<CustomersDirectory>(client, directoryKey, (previous) =>
        previous
          ? { ...previous, customers: previous.customers.map((c) => (c.id === id ? updater(c) : c)) }
          : previous
      );
    },
    [client, directoryKey]
  );

  return useMemo(
    () => ({
      customers: directory.data?.customers ?? NO_CUSTOMERS,
      suppressedPhones: directory.data?.suppressedPhones ?? NO_PHONES,
      campaignStates: campaigns.data ?? NO_STATES,
      isLoading: directory.isLoading,
      error: directory.error,
      refetchAll,
      refetchIfStale,
      patchCustomer,
    }),
    [directory.data, directory.isLoading, directory.error, campaigns.data, refetchAll, refetchIfStale, patchCustomer]
  );
}
