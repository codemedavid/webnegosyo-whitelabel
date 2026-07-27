/**
 * The pure decisions behind the platform backend's realtime subscription.
 *
 * Convex pushes changes to every subscribed client; Postgres does not, so a
 * tenant on `order_backend = 'platform'` needs an explicit Supabase Realtime
 * channel to learn about a new order without waiting for a poll. The React
 * plumbing lives in `lib/hooks.ts`; everything that can be decided without a
 * socket lives here so it is unit-testable.
 *
 * Realtime is enabled by migration `20260727120000` (which added `orders` to
 * the `supabase_realtime` publication with `replica identity full` — before
 * that the publication was empty and delivered nothing to anyone). Because that
 * path has never been proven end-to-end on a live order, polling is kept as a
 * permanent safety net rather than removed; see `resolvePollMs`.
 */

/** Poll interval while realtime is delivering — a safety net, not the main path. */
export const REALTIME_FALLBACK_POLL_MS = 60000;

/** Poll interval when realtime is not connected; the merchant still needs orders. */
export const DISCONNECTED_POLL_MS = 15000;

export type RealtimeStatus = "connected" | "disconnected";

export interface OrderChannelBinding {
  event: "*";
  schema: "public";
  table: "orders";
  /** PostgREST-style server-side filter, e.g. `tenant_id=eq.<uuid>`. */
  filter: string;
}

export interface OrderSubscription {
  channelName: string;
  binding: OrderChannelBinding;
}

/** Rows a `postgres_changes` payload can carry, depending on the event. */
export interface OrderChangePayload {
  new?: { tenant_id?: string | null } | null;
  old?: { tenant_id?: string | null } | null;
}

/**
 * Order refs whose results change when a row in `orders` changes. Kept explicit
 * rather than matching on the `orders:` prefix so a future ref has to opt in
 * deliberately.
 */
const REALTIME_BACKED_REFS: readonly string[] = [
  "orders:getOrders",
  "orders:getOrderById",
  "orders:getRealtimeQueue",
  "orders:getDashboardStats",
  "orders:getDashboardStatsByPeriod",
];

/**
 * The channel a tenant's order changes arrive on.
 *
 * The tenant is in the channel name as well as the filter so switching stores
 * cannot reuse a channel still bound to the previous tenant's rows.
 */
export function buildOrderSubscription(tenantId: string): OrderSubscription {
  return {
    channelName: `platform-orders:${tenantId}`,
    binding: {
      event: "*",
      schema: "public",
      table: "orders",
      filter: `tenant_id=eq.${tenantId}`,
    },
  };
}

/**
 * Whether an incoming change actually belongs to the subscribed tenant.
 *
 * Defence in depth behind the server-side filter: a payload we cannot attribute
 * to this tenant must not refresh the screen or ring the new-order alert.
 */
export function isOrderChangeForTenant(
  payload: OrderChangePayload,
  tenantId: string
): boolean {
  // DELETE payloads carry `old`; INSERT/UPDATE carry `new`.
  const rowTenantId = payload.new?.tenant_id ?? payload.old?.tenant_id ?? null;
  return rowTenantId != null && rowTenantId === tenantId;
}

/**
 * Map a supabase-js channel status onto the two states this module cares about.
 * Anything unrecognized counts as disconnected — unproven is not connected, and
 * guessing "connected" would slow the poll and make orders arrive a minute late.
 */
export function resolveRealtimeStatus(status: string): RealtimeStatus {
  return status === "SUBSCRIBED" ? "connected" : "disconnected";
}

/** How often to re-read while realtime is in the given state. */
export function resolvePollMs(status: RealtimeStatus): number {
  return status === "connected" ? REALTIME_FALLBACK_POLL_MS : DISCONNECTED_POLL_MS;
}

/** Whether this ref should re-read when an order row changes. */
export function isRefRealtimeBacked(ref: string): boolean {
  return REALTIME_BACKED_REFS.includes(ref);
}
