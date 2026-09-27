/**
 * Which orders on screen belong to a known customer, on the shared cache.
 *
 * One entry per (tenant, backend, set of orders and their statuses): a status
 * change is exactly when a stamp can land, so it must re-read, while a list
 * re-render that changed nothing must not. The queue and the order screen both
 * read through here, so the chip and the card never disagree.
 *
 * Gated on `loyalty_manage` before any request — the platform refuses the
 * read without it, and a staff member without the grant should see a plain
 * queue, not a failing one.
 */

import { useCallback, useMemo } from "react";
import { resourceKey } from "../backends/query-keys";
import { useAuthStore } from "../../stores/auth-store";
import { hasPermission } from "../staff-permissions";
import { PLATFORM_BACKEND } from "../customers/lifecycle-plan";
import {
  ORDER_CUSTOMERS_RESOURCE,
  toOrderCustomerQuery,
  type OrderCustomerSource,
  type OrderCustomerSummary,
} from "../loyalty/order-customers";
import { fetchOrderCustomers } from "../loyalty/order-customers-repo";
import { useResource } from "./use-resource";

/** The newest orders a queue badges; a 2,000-order date range badges its first page. */
const MAX_TRACKED_ORDERS = 200;

const STALE_MS = 30_000;

interface OrderCustomersData {
  isLoyaltyLive: boolean;
  byOrderId: ReadonlyMap<string, OrderCustomerSummary>;
}

export interface OrderCustomersView {
  byOrderId: ReadonlyMap<string, OrderCustomerSummary>;
  isLoyaltyLive: boolean;
  /** False when the viewer lacks `loyalty_manage` or the store is unresolved. */
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY: ReadonlyMap<string, OrderCustomerSummary> = new Map();

/** A short, stable fingerprint of the orders asked about (djb2). */
function fingerprint(parts: readonly string[]): string {
  let hash = 5381;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) hash = ((hash << 5) + hash + part.charCodeAt(i)) | 0;
    hash = ((hash << 5) + hash + 124) | 0;
  }
  return `${parts.length}:${(hash >>> 0).toString(36)}`;
}

export function useOrderCustomers(orders: readonly OrderCustomerSource[] | null | undefined): OrderCustomersView {
  const tenantId = useAuthStore((s) => s.tenantId);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);

  const canRead = hasPermission({ role, isOwner, permissions }, "loyalty_manage");
  const backend = orderBackend ? PLATFORM_BACKEND[orderBackend] : null;

  const queries = useMemo(
    () => (orders ?? []).slice(0, MAX_TRACKED_ORDERS).map(toOrderCustomerQuery),
    [orders],
  );
  const signature = useMemo(
    () => fingerprint(queries.map((query) => `${query.orderId}|${query.status ?? ""}|${query.contact ?? ""}`)),
    [queries],
  );

  const isEnabled = Boolean(tenantId && backend && canRead && queries.length > 0);

  const fetcher = useCallback(async (): Promise<OrderCustomersData> => {
    const result = await fetchOrderCustomers(tenantId as string, backend as string, queries);
    if (!result.ok) {
      if (result.reason === "forbidden") return { isLoyaltyLive: false, byOrderId: EMPTY };
      throw new Error("Customer details could not be loaded.");
    }
    return {
      isLoyaltyLive: result.isLoyaltyLive,
      byOrderId: new Map(result.customers.map((customer) => [customer.orderId, customer])),
    };
  }, [tenantId, backend, queries]);

  // The key, not the fetcher, decides when to read again: a re-render that
  // rebuilt `queries` with the same orders and statuses keeps the cached answer.
  const resource = useResource(
    isEnabled ? resourceKey(ORDER_CUSTOMERS_RESOURCE, tenantId, backend, signature) : null,
    fetcher,
    { staleTime: STALE_MS },
  );

  return {
    byOrderId: resource.data?.byOrderId ?? EMPTY,
    isLoyaltyLive: resource.data?.isLoyaltyLive ?? false,
    isEnabled,
    isLoading: resource.isLoading,
    error: resource.error,
    refetch: resource.refetch,
  };
}
