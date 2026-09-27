/**
 * Vouchers on the shared cache.
 *
 * The Vouchers tab reads the list; the editor reads one voucher and its
 * recent uses. A switch flip patches the list optimistically and puts it back
 * on failure; any write then invalidates every name here, so the list, the
 * editor and the performance card never show two versions of one voucher.
 * The register's own read (`/api/vouchers/list`) is a separate, server-side
 * copy and is not cached here.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import {
  getManagedVoucher,
  listManagedVouchers,
  listVoucherRedemptions,
  type VoucherRedemption,
} from "../voucher-admin/voucher-repository";
import type { Voucher } from "../vouchers/types";
import { resourceKey } from "../backends/query-keys";
import { useResource, type ResourceResult } from "./use-resource";
import { invalidateResources, setResourceData } from "./resource-cache";

export const VOUCHERS_RESOURCE = "vouchers";
export const VOUCHER_RESOURCE = "voucher";
export const VOUCHER_REDEMPTIONS_RESOURCE = "voucher-redemptions";

const NO_VOUCHERS: Voucher[] = [];

export interface VouchersResult extends Omit<ResourceResult<Voucher[]>, "data"> {
  vouchers: Voucher[];
  /** Optimistic patch of the cached list; a no-op before the first read. */
  patch: (updater: (vouchers: Voucher[]) => Voucher[]) => void;
  invalidate: () => Promise<void>;
}

/** Every cached copy of the tenant's vouchers, one voucher, or its uses, re-reads. */
export function invalidateVouchers(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResources(
    client,
    [VOUCHERS_RESOURCE, VOUCHER_RESOURCE, VOUCHER_REDEMPTIONS_RESOURCE],
    tenantId,
  );
}

export function useVouchers(tenantId: string | null): VouchersResult {
  const client = useQueryClient();
  const key = tenantId ? resourceKey(VOUCHERS_RESOURCE, tenantId) : null;
  const fetcher = useCallback(() => listManagedVouchers(tenantId as string), [tenantId]);
  const resource = useResource<Voucher[]>(key, fetcher);

  const patch = useCallback(
    (updater: (vouchers: Voucher[]) => Voucher[]) => {
      if (!key) return;
      setResourceData<Voucher[]>(client, key, (previous) => (previous ? updater(previous) : previous));
    },
    [client, key],
  );

  const invalidate = useCallback(async () => {
    if (!tenantId) return;
    await invalidateVouchers(client, tenantId);
  }, [client, tenantId]);

  const { data, ...rest } = resource;
  return { ...rest, vouchers: data ?? NO_VOUCHERS, patch, invalidate };
}

/** One voucher for the editor; a `null` id (a new voucher) reads nothing. */
export function useVoucher(
  tenantId: string | null,
  voucherId: string | null,
): ResourceResult<Voucher | null> {
  const fetcher = useCallback(
    () => getManagedVoucher(voucherId as string, tenantId as string),
    [voucherId, tenantId],
  );
  return useResource<Voucher | null>(
    tenantId && voucherId ? resourceKey(VOUCHER_RESOURCE, tenantId, voucherId) : null,
    fetcher,
  );
}

/** A saved voucher's recent uses, for its performance card. */
export function useVoucherRedemptions(
  tenantId: string | null,
  voucherId: string | null,
): ResourceResult<VoucherRedemption[]> {
  const fetcher = useCallback(
    () => listVoucherRedemptions(voucherId as string, tenantId as string),
    [voucherId, tenantId],
  );
  return useResource<VoucherRedemption[]>(
    tenantId && voucherId ? resourceKey(VOUCHER_REDEMPTIONS_RESOURCE, tenantId, voucherId) : null,
    fetcher,
  );
}

/** The editor's write paths need only the invalidation, not a list. */
export function useVouchersInvalidation(): (tenantId: string) => Promise<void> {
  const client = useQueryClient();
  return useCallback((tenantId: string) => invalidateVouchers(client, tenantId), [client]);
}
