/**
 * The payment methods the tender screen offers, on the shared cache.
 *
 * Fetched per visit before this, behind a full-screen spinner: every checkout
 * paid a network round trip before the cashier saw the amount due. Now ONE
 * read carries every active method with its order-type links, cached and
 * snapshotted to disk, and the order type is applied on the device
 * (`methodsForTender`). So an offline register offers the right methods for
 * EVERY order type — not only the ones it happened to charge while online —
 * switching type costs no read, and the offline download (`offline-pack.ts`)
 * saves the whole set up front. The register warms it while the cashier is
 * still adding items, and the payment-method editor's invalidation
 * (`invalidatePaymentMethods`) re-reads it.
 *
 * An edit settles against ANY method, not the ones the order type allows: a
 * GCash delivery order topped up at the counter is paid in cash, and refusing
 * that would strand the cashier.
 */

import { useCallback, useMemo } from "react";
import { listRegisterPaymentMethods } from "../pos-catalog";
import { methodsForTender, type RegisterPaymentMethod } from "../pos-payment-methods";
import { resourceKey } from "../backends/query-keys";
import { useResource, type ResourceResult } from "./use-resource";
import { TENDER_PAYMENT_METHODS_RESOURCE } from "./use-payment-methods";

/** The key segment for the register's one copy of every method. */
const REGISTER_METHODS = "register";

/** Methods change a few times a year; a sale should never wait on them. */
const TENDER_METHODS_STALE_MS = 5 * 60_000;

const NO_METHODS: RegisterPaymentMethod[] = [];

export interface TenderPaymentMethods extends Omit<ResourceResult<RegisterPaymentMethod[]>, "data"> {
  methods: RegisterPaymentMethod[];
}

/** The cache key the register's methods live on (shared with `offline-pack.ts`). */
export function tenderPaymentMethodsKey(tenantId: string) {
  return resourceKey(TENDER_PAYMENT_METHODS_RESOURCE, tenantId, REGISTER_METHODS);
}

export function useTenderPaymentMethods(
  tenantId: string | null,
  orderTypeId: string | null,
  isEditing: boolean,
): TenderPaymentMethods {
  const fetcher = useCallback(() => listRegisterPaymentMethods(tenantId as string), [tenantId]);
  const { data, ...rest } = useResource<RegisterPaymentMethod[]>(
    tenantId ? tenderPaymentMethodsKey(tenantId) : null,
    fetcher,
    { offlineSnapshot: true, staleTime: TENDER_METHODS_STALE_MS },
  );
  const all = data ?? NO_METHODS;
  const methods = useMemo(
    () => (all === NO_METHODS ? NO_METHODS : methodsForTender(all, { orderTypeId, isEditing })),
    [all, orderTypeId, isEditing],
  );
  return { ...rest, methods };
}
