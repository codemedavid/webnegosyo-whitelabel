/**
 * Payment methods on the shared cache.
 *
 * The Payments tab reads the list; the editor reads one row. A toggle or a
 * reorder patches the list optimistically and puts it back on failure; a
 * save, a delete or a toggle then invalidates BOTH names, so the editor and
 * the list can never show two different versions of the same method.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import {
  getPaymentMethod,
  listManagedPaymentMethods,
  type ManagedPaymentMethod,
} from "../payment-methods";
import { resourceKey } from "../backends/query-keys";
import { useResource, type ResourceResult } from "./use-resource";
import { invalidateResources, setResourceData } from "./resource-cache";

export const PAYMENT_METHODS_RESOURCE = "payment-methods";
export const PAYMENT_METHOD_RESOURCE = "payment-method";

const NO_METHODS: ManagedPaymentMethod[] = [];

export interface PaymentMethodsResult extends Omit<ResourceResult<ManagedPaymentMethod[]>, "data"> {
  methods: ManagedPaymentMethod[];
  /** Optimistic patch of the cached list; a no-op before the first read. */
  patch: (updater: (methods: ManagedPaymentMethod[]) => ManagedPaymentMethod[]) => void;
  /** Re-read the list and any open row after a write. */
  invalidate: () => Promise<void>;
}

/** Every copy of the tenant's list and any row loaded on its own re-reads. */
export function invalidatePaymentMethods(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResources(client, [PAYMENT_METHODS_RESOURCE, PAYMENT_METHOD_RESOURCE], tenantId);
}

export function usePaymentMethods(tenantId: string | null): PaymentMethodsResult {
  const client = useQueryClient();
  const key = tenantId ? resourceKey(PAYMENT_METHODS_RESOURCE, tenantId) : null;
  const fetcher = useCallback(() => listManagedPaymentMethods(tenantId as string), [tenantId]);
  const resource = useResource<ManagedPaymentMethod[]>(key, fetcher);

  const patch = useCallback(
    (updater: (methods: ManagedPaymentMethod[]) => ManagedPaymentMethod[]) => {
      if (!key) return;
      setResourceData<ManagedPaymentMethod[]>(client, key, (previous) =>
        previous ? updater(previous) : previous
      );
    },
    [client, key]
  );

  const invalidate = useCallback(async () => {
    if (!tenantId) return;
    await invalidatePaymentMethods(client, tenantId);
  }, [client, tenantId]);

  const { data, ...rest } = resource;
  return { ...rest, methods: data ?? NO_METHODS, patch, invalidate };
}

/** One method for the editor; `null` id (a new method) reads nothing. */
export function usePaymentMethod(
  tenantId: string | null,
  methodId: string | null
): ResourceResult<ManagedPaymentMethod | null> {
  const fetcher = useCallback(
    () => getPaymentMethod(methodId as string, tenantId as string),
    [methodId, tenantId]
  );
  return useResource<ManagedPaymentMethod | null>(
    tenantId && methodId ? resourceKey(PAYMENT_METHOD_RESOURCE, tenantId, methodId) : null,
    fetcher
  );
}

/** The editor's write paths need only the invalidation, not a list. */
export function usePaymentMethodsInvalidation(): (tenantId: string) => Promise<void> {
  const client = useQueryClient();
  return useCallback((tenantId: string) => invalidatePaymentMethods(client, tenantId), [client]);
}
