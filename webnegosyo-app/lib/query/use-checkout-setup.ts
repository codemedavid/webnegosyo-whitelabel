/**
 * The register's copy of the storefront's checkout questions and delivery
 * pricing (`pos-checkout-fields.ts`), on the shared cache.
 *
 * Snapshotted for offline use like the channel prices, but never required: a
 * failed read just means no extra questions and no fee suggestion — the sale
 * itself does not depend on it.
 */

import { useCallback } from "react";
import { fetchCheckoutSetup, type CheckoutSetup } from "../pos-checkout-fields";
import { resourceKey } from "../backends/query-keys";
import { useResource, type ResourceResult } from "./use-resource";

export const CHECKOUT_SETUP_RESOURCE = "checkout-setup";

/** The cache key the setup lives on (shared with the offline download). */
export function checkoutSetupKey(tenantId: string) {
  return resourceKey(CHECKOUT_SETUP_RESOURCE, tenantId);
}

export function useCheckoutSetup(tenantId: string | null): ResourceResult<CheckoutSetup> {
  const fetcher = useCallback(() => fetchCheckoutSetup(tenantId as string), [tenantId]);
  return useResource<CheckoutSetup>(tenantId ? checkoutSetupKey(tenantId) : null, fetcher, {
    offlineSnapshot: true,
  });
}
