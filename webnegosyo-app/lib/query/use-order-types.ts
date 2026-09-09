/**
 * The tenant's enabled order types, on the shared cache.
 *
 * Read by the register (to default the sale's type and offer the chips) and by
 * the payment-method editor (to offer the order types a method is linked to).
 * One read serves both.
 */

import { useCallback } from "react";
import { listOrderTypes, type PosOrderType } from "../pos-catalog";
import { resourceKey } from "../backends/query-keys";
import { useResource, type ResourceResult } from "./use-resource";

export const ORDER_TYPES_RESOURCE = "order-types";

/** Order types change when the merchant edits settings, which is rare. */
const ORDER_TYPES_STALE_MS = 60_000;

export function useOrderTypes(tenantId: string | null): ResourceResult<PosOrderType[]> {
  const fetcher = useCallback(() => listOrderTypes(tenantId as string), [tenantId]);
  return useResource<PosOrderType[]>(
    tenantId ? resourceKey(ORDER_TYPES_RESOURCE, tenantId) : null,
    fetcher,
    { staleTime: ORDER_TYPES_STALE_MS }
  );
}
