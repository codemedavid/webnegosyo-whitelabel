/**
 * What the register's channels charge, on the shared cache.
 *
 * The order types and their exact per-item prices ride ONE cache entry on
 * purpose: a chip offered before its prices have landed would ring up at list
 * price on a marked-up channel, so they arrive together or not at all. A
 * failed read is an error the register shows, never a silent fallback to list.
 *
 * The REGISTER's reader (`listRegisterOrderTypes`), not the shared one: a
 * web-only type must not become a chip just because the payment editor sees it.
 */

import { useCallback } from "react";
import type { QueryClient } from "@tanstack/query-core";
import {
  listOrderTypeItemPrices,
  listRegisterOrderTypes,
  type PosOrderType,
} from "../pos-catalog";
import {
  buildOrderTypePriceIndex,
  type OrderTypePriceIndex,
} from "../order-type-pricing";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource, type ResourceResult } from "./use-resource";

export const REGISTER_PRICING_RESOURCE = "register-pricing";

export interface RegisterPricing {
  orderTypes: PosOrderType[];
  priceIndex: OrderTypePriceIndex;
}

export async function fetchRegisterPricing(tenantId: string): Promise<RegisterPricing> {
  const [orderTypes, priceRows] = await Promise.all([
    listRegisterOrderTypes(tenantId),
    listOrderTypeItemPrices(tenantId),
  ]);
  return { orderTypes, priceIndex: buildOrderTypePriceIndex(priceRows) };
}

export function useRegisterPricing(tenantId: string | null): ResourceResult<RegisterPricing> {
  const fetcher = useCallback(() => fetchRegisterPricing(tenantId as string), [tenantId]);
  return useResource<RegisterPricing>(
    tenantId ? resourceKey(REGISTER_PRICING_RESOURCE, tenantId) : null,
    fetcher,
    // Snapshotted WITH the catalog: an offline register charges the channel
    // prices it last saw, never list prices, on the same rule as a live read.
    { offlineSnapshot: true }
  );
}

/** Re-read the tenant's channel pricing (an order type or a price was edited). */
export function invalidateRegisterPricing(
  client: QueryClient,
  tenantId: string
): Promise<void> {
  return invalidateResource(client, REGISTER_PRICING_RESOURCE, tenantId);
}
