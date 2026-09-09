/**
 * Which cached queries an order change refreshes.
 *
 * `invalidateQueries` with the default `refetchType: "active"` refetches every
 * mounted query the predicate admits IMMEDIATELY, so real-time latency is the
 * same as when each hook owned its channel. Queries nobody is looking at are
 * only marked stale and refetch when next observed.
 *
 * The branch check happens here, per key, rather than on the channel: one
 * channel per tenant is shared by a store-wide alerts watcher and a
 * branch-scoped kitchen board, and each must see only the changes it may.
 * Supabase Realtime allows one filter clause per binding, spent on the tenant,
 * so `isOrderChangeInScope` is where the branch is enforced (defence in depth
 * behind the read scoping; see `branch-read-scoping.test.ts`).
 */

import type { QueryClient } from "@tanstack/query-core";
import { isPlatformKey, keyTenant, platformKeyRef, platformKeyScope } from "./query-keys";
import {
  isOrderChangeInScope,
  isRefRealtimeBacked,
  type OrderChangePayload,
} from "./supabase-realtime";

export function isQueryAffectedByOrderChange(
  key: readonly unknown[],
  tenantId: string,
  payload: OrderChangePayload
): boolean {
  if (!isPlatformKey(key)) return false;
  if (keyTenant(key) !== tenantId) return false;
  if (!isRefRealtimeBacked(platformKeyRef(key))) return false;
  return isOrderChangeInScope(payload, tenantId, platformKeyScope(key));
}

/** Refetch every active realtime-backed key the change touches. */
export function invalidateForOrderChange(
  client: QueryClient,
  tenantId: string,
  payload: OrderChangePayload
): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => isQueryAffectedByOrderChange(query.queryKey, tenantId, payload),
  });
}

/**
 * Refetch every active platform key of a tenant — after a platform mutation,
 * so the screen updates deterministically even if the socket is down.
 */
export function invalidatePlatformQueries(client: QueryClient, tenantId: string): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => isPlatformKey(query.queryKey) && keyTenant(query.queryKey) === tenantId,
  });
}
