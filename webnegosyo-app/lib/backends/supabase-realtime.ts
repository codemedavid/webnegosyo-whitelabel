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

import { isOrderInScope, type BranchScope } from "../branch-scope";

/** Poll interval while realtime is delivering — a safety net, not the main path. */
export const REALTIME_FALLBACK_POLL_MS = 60000;

/** Poll interval when realtime is not connected; the merchant still needs orders. */
export const DISCONNECTED_POLL_MS = 15000;

/**
 * The longest a failing read waits before trying again. Every device
 * re-issuing a failing read on the base interval is what kept the platform
 * database saturated on 2026-09-20: the slower Postgres got, the more the
 * fleet asked of it.
 */
export const MAX_FAILURE_POLL_MS = 120000;

/** Jitter applied to a retry, so devices that failed together do not retry together. */
const RETRY_JITTER_RATIO = 0.2;

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

/**
 * A row as a `postgres_changes` payload carries it. `replica identity full`
 * means every column is present, so the branch can be read off it directly.
 */
export interface OrderChangeRow {
  tenant_id?: string | null;
  outlet_id?: string | null;
  customerData?: unknown;
  customer_data?: unknown;
}

/** Rows a `postgres_changes` payload can carry, depending on the event. */
export interface OrderChangePayload {
  new?: OrderChangeRow | null;
  old?: OrderChangeRow | null;
}

/**
 * Order refs whose results change when a row in `orders` changes. Kept explicit
 * rather than matching on the `orders:` prefix so a future ref has to opt in
 * deliberately.
 */
const REALTIME_BACKED_REFS: readonly string[] = [
  "orders:getOrders",
  "orders:getOrderById",
  // Line items are written in the same breath as their order, so an order
  // change is their freshness signal too. Off this list, the kitchen board
  // polls a 10k-row join every 15s forever and a new ticket renders itemless
  // for up to a full poll interval.
  "orders:getAllOrderItems",
  "orders:getRealtimeQueue",
  "orders:getDashboardStats",
  "orders:getDashboardStatsByPeriod",
  // A settlement is recorded in the same breath as the order's payment_status,
  // so an order change is the ledger's freshness signal too.
  "orders:getOrderPaymentsForOrders",
];

/**
 * The channel a tenant's order changes arrive on.
 *
 * The tenant is in the channel name as well as the filter so switching stores
 * cannot reuse a channel still bound to the previous tenant's rows.
 *
 * `instanceKey` separates concurrent subscribers on the SAME tenant —
 * <GlobalOrderAlerts> and the dashboard both watch the queue, and supabase-js
 * keys channels by topic, so without it the second one collides with the first.
 */
export function buildOrderSubscription(
  tenantId: string,
  instanceKey = "default"
): OrderSubscription {
  return {
    channelName: `platform-orders:${tenantId}:${instanceKey}`,
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
 * Whether an incoming change is one this session may act on at all.
 *
 * Supabase Realtime accepts exactly ONE filter clause per binding, and it is
 * spent on `tenant_id` — so the branch has to be checked here, when the payload
 * lands. That is not a formality: a manager whose queue refetched, or whose
 * device chimed, for a sale at another branch would learn that the sale
 * happened. The read scoping exists to prevent exactly that.
 *
 * The row is read through `getOrderOutletId`, so a row that carries the branch
 * only in `customer_data` — written before the column was backfilled, or by a
 * backend that has no column — is attributed the same way the order lists
 * attribute it. Client and server then agree on which orders exist, instead of
 * the queue count disagreeing with the queue.
 */
export function isOrderChangeInScope(
  payload: OrderChangePayload,
  tenantId: string,
  scope: BranchScope
): boolean {
  if (!isOrderChangeForTenant(payload, tenantId)) return false;
  if (scope.kind === "all") return true;

  const row = payload.new ?? payload.old ?? null;
  if (!row) return false;

  // Realtime delivers snake_case columns; `getOrderOutletId` reads the camelCase
  // blob key the Convex DTOs use, so hand it both spellings of the blob.
  return isOrderInScope(scope, {
    outlet_id: row.outlet_id ?? null,
    customerData: row.customerData ?? row.customer_data,
  });
}

/**
 * Map a supabase-js channel status onto the two states this module cares about.
 * Anything unrecognized counts as disconnected — unproven is not connected, and
 * guessing "connected" would slow the poll and make orders arrive a minute late.
 */
export function resolveRealtimeStatus(status: string): RealtimeStatus {
  return status === "SUBSCRIBED" ? "connected" : "disconnected";
}

/**
 * How often to re-read while realtime is in the given state.
 *
 * `failureCount` is the number of consecutive reads that have failed (the
 * cache resets it on the first success). Each failure doubles the wait, up to
 * `MAX_FAILURE_POLL_MS`, and spreads it by ±20 % so a fleet that failed
 * together does not retry together. A healthy poll is exact and unjittered.
 */
export function resolvePollMs(
  status: RealtimeStatus,
  failureCount = 0,
  random: () => number = Math.random
): number {
  const base = status === "connected" ? REALTIME_FALLBACK_POLL_MS : DISCONNECTED_POLL_MS;
  if (failureCount <= 0) return base;

  const backedOff = Math.min(base * 2 ** failureCount, MAX_FAILURE_POLL_MS);
  const jitter = 1 - RETRY_JITTER_RATIO + 2 * RETRY_JITTER_RATIO * random();
  return Math.round(backedOff * jitter);
}

/**
 * The cache's bookkeeping a failure streak is read from. `fetchFailureCount`
 * is NOT usable for this: it is reset at the start of every fetch and only
 * counts retries inside one, so across polls it never rises above one.
 */
export interface QueryOutcomeState {
  dataUpdatedAt: number;
  errorUpdateCount: number;
}

/** Where the streak was last broken: the success, and the errors before it. */
export interface FailureStreak {
  dataUpdatedAt: number;
  errorsAtLastSuccess: number;
}

export const NO_FAILURES: FailureStreak = { dataUpdatedAt: 0, errorsAtLastSuccess: 0 };

/**
 * How many reads have failed since the last one that landed.
 *
 * Pure: the caller keeps the returned `streak` and hands it back next time. A
 * new success (a later `dataUpdatedAt`) moves the marker, so the count starts
 * again from zero; a new query with fresh counters heals the marker the same
 * way, so a stale marker can never inflate — or hide — a streak.
 */
export function countConsecutiveFailures(
  state: QueryOutcomeState,
  previous: FailureStreak
): { streak: FailureStreak; failures: number } {
  const streak =
    state.dataUpdatedAt !== previous.dataUpdatedAt
      ? { dataUpdatedAt: state.dataUpdatedAt, errorsAtLastSuccess: state.errorUpdateCount }
      : previous;
  return { streak, failures: Math.max(0, state.errorUpdateCount - streak.errorsAtLastSuccess) };
}

/** Whether this ref should re-read when an order row changes. */
export function isRefRealtimeBacked(ref: string): boolean {
  return REALTIME_BACKED_REFS.includes(ref);
}
