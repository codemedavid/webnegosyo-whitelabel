/**
 * The store's Tax & discounts settings on the shared cache.
 *
 * Snapshotted for offline use: the register must price a Senior/PWD discount
 * the same way with no signal as with one.
 */

import { useCallback } from "react";
import type { QueryClient } from "@tanstack/query-core";
import { fetchTaxProfile } from "../tax-profile-service";
import type { TaxProfile } from "../gov-discount";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource, type ResourceResult } from "./use-resource";

export const TAX_PROFILE_RESOURCE = "tax-profile";

export function taxProfileKey(tenantId: string) {
  return resourceKey(TAX_PROFILE_RESOURCE, tenantId);
}

export function useTaxProfile(tenantId: string | null): ResourceResult<TaxProfile | null> {
  const fetcher = useCallback(() => fetchTaxProfile(tenantId as string), [tenantId]);
  return useResource<TaxProfile | null>(tenantId ? taxProfileKey(tenantId) : null, fetcher, {
    offlineSnapshot: true,
  });
}

export function invalidateTaxProfile(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResource(client, TAX_PROFILE_RESOURCE, tenantId);
}
