/**
 * Optimistic patches to the cached order reads.
 *
 * A platform tenant's status advance and collected payment each take a round
 * trip before the invalidated read lands. In that gap the row still shows the
 * old state, which is what tempts the second tap. These patch the cache
 * immediately and immutably, and return a rollback for the failure path.
 *
 * Only this tenant's order keys are touched: the list reads (every `limit`),
 * the detail read of that order, and that order's payment ledger. Convex
 * tenants hold no platform keys, so for them every call is a harmless no-op —
 * their subscription is live already.
 *
 * Screens reach this through `useOptimisticOrderCache`, the one place outside
 * `lib/query` that is allowed to hold the query client (see the wiring
 * guardrail in `lib/query-layer-wiring.test.ts`).
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/query-core";
import { isPlatformKey, keyTenant, platformKeyRef } from "../backends/query-keys";
import { useAuthStore } from "../../stores/auth-store";

const ORDER_LIST_REF = "orders:getOrders";
const ORDER_DETAIL_REF = "orders:getOrderById";
const ORDER_PAYMENTS_REF = "orders:getOrderPayments";

const ARGS_INDEX = 2;

interface OrderRowLike {
  _id: string;
  status: string;
}

interface PaymentRowLike {
  _id: string;
}

export type Rollback = () => void;

/** The rows with that order's status replaced; the same array when untouched. */
export function patchOrderStatusRows<T extends OrderRowLike>(
  rows: readonly T[] | undefined,
  orderId: string,
  status: string,
): readonly T[] | undefined {
  if (!rows) return rows;
  const index = rows.findIndex((row) => row._id === orderId);
  if (index === -1) return rows;
  return rows.map((row, i) => (i === index ? { ...row, status } : row));
}

function keyArgs(key: QueryKey): Record<string, unknown> {
  const args = key[ARGS_INDEX];
  return args && typeof args === "object" ? (args as Record<string, unknown>) : {};
}

function isTenantRef(key: QueryKey, tenantId: string, refName: string): boolean {
  return isPlatformKey(key) && keyTenant(key) === tenantId && platformKeyRef(key) === refName;
}

/**
 * Apply `update` to every matching key, remembering what was there. The
 * returned rollback restores exactly the previous values.
 */
function patchMatchingKeys(
  client: QueryClient,
  predicate: (key: QueryKey) => boolean,
  update: (previous: unknown) => unknown,
): Rollback {
  const snapshots = client.getQueriesData({ predicate: (query) => predicate(query.queryKey) });
  snapshots.forEach(([key, previous]) => {
    const next = update(previous);
    if (next !== previous) client.setQueryData(key, next);
  });
  return () => {
    snapshots.forEach(([key, previous]) => {
      client.setQueryData(key, previous);
    });
  };
}

export function patchOrderStatusInCache(
  client: QueryClient,
  tenantId: string,
  orderId: string,
  status: string,
): Rollback {
  const rollbackLists = patchMatchingKeys(
    client,
    (key) => isTenantRef(key, tenantId, ORDER_LIST_REF),
    (previous) => patchOrderStatusRows(previous as readonly OrderRowLike[] | undefined, orderId, status),
  );
  const rollbackDetail = patchMatchingKeys(
    client,
    (key) => isTenantRef(key, tenantId, ORDER_DETAIL_REF) && keyArgs(key).orderId === orderId,
    (previous) => {
      const row = previous as OrderRowLike | null | undefined;
      return row && row._id === orderId ? { ...row, status } : previous;
    },
  );
  return () => {
    rollbackLists();
    rollbackDetail();
  };
}

export function appendOrderPaymentInCache<P extends PaymentRowLike>(
  client: QueryClient,
  tenantId: string,
  orderId: string,
  payment: P,
): Rollback {
  return patchMatchingKeys(
    client,
    (key) => isTenantRef(key, tenantId, ORDER_PAYMENTS_REF) && keyArgs(key).orderId === orderId,
    (previous) => {
      const ledger = (previous as readonly P[] | undefined) ?? [];
      if (ledger.some((row) => row._id === payment._id)) return previous;
      return [...ledger, payment];
    },
  );
}

const NOOP_ROLLBACK: Rollback = () => {};

export interface OptimisticOrderCache {
  patchOrderStatus: (orderId: string, status: string) => Rollback;
  appendOrderPayment: <P extends PaymentRowLike>(orderId: string, payment: P) => Rollback;
}

/** The patches bound to the query client and the tenant in scope. */
export function useOptimisticOrderCache(): OptimisticOrderCache {
  const client = useQueryClient();
  const tenantId = useAuthStore((s) => s.tenantId);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  const scopedTenantId = impersonatedTenantId ?? tenantId;

  const patchOrderStatus = useCallback(
    (orderId: string, status: string) =>
      scopedTenantId ? patchOrderStatusInCache(client, scopedTenantId, orderId, status) : NOOP_ROLLBACK,
    [client, scopedTenantId],
  );

  const appendOrderPayment = useCallback(
    <P extends PaymentRowLike>(orderId: string, payment: P) =>
      scopedTenantId
        ? appendOrderPaymentInCache(client, scopedTenantId, orderId, payment)
        : NOOP_ROLLBACK,
    [client, scopedTenantId],
  );

  return { patchOrderStatus, appendOrderPayment };
}
