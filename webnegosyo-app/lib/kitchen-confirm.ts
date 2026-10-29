// The kitchen's "Confirm" — pure rules, no React, no backend.
//
// A counter sale lands on the board as `confirmed` (the cashier rang it up) and
// the kitchen display used to only flash it, so a ticket could sit unseen. Now
// a ticket that arrives while the board is open RINGS until a cook taps
// Confirm, and the cashier hears back.
//
// "Kitchen confirmed" is the move `confirmed → preparing`, through the same
// status write the bump uses. No new column: it works on every order backend
// as-is (platform Supabase, Convex, tenant Supabase). The cost is that a
// cashier moving an order to Preparing by hand reads the same to other
// devices — the database cannot say who tapped.

import { hasLiveOrderBackend, type OrderSessionFields } from "./order-backend";
import { hasAnyPermission, type StaffPermissionHolder } from "./staff-permissions";
import { displayCustomerName } from "./order-visuals";
import { getOrderTableNumber } from "./order-table-number";
import { formatDailyOrderNumber } from "./order-number";

/** The status a ticket waits in until the kitchen confirms it. */
export const AWAITING_KITCHEN_STATUS = "confirmed";

/** The status a kitchen Confirm writes. */
export const KITCHEN_CONFIRMED_STATUS = "preparing";

/** How often an unconfirmed ticket rings again. */
export const KITCHEN_RING_INTERVAL_MS = 15_000;

/** Statuses that mean the kitchen has the order (a bump can skip preparing). */
const KITCHEN_HAS_IT: readonly string[] = ["preparing", "ready"];

/** Later beats earlier when one poll lists an order twice. */
const STATUS_RANK: Readonly<Record<string, number>> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: 5,
};

// ── Kitchen board ───────────────────────────────────────────────────────────

/**
 * - `ringing`: arrived while the board was open, not confirmed yet.
 * - `waiting`: not confirmed, but was already on the board when it opened —
 *   offered a Confirm button without ringing.
 * - `confirmed`: the kitchen has it.
 */
export type KitchenTicketStatus = "ringing" | "waiting" | "confirmed";

export interface RingTracker {
  /** Ticket ids on the board at the last answered snapshot; null = none yet. */
  seen: ReadonlySet<string> | null;
  /** Ringing ticket id → when it first rang (ms). */
  ringing: ReadonlyMap<string, number>;
}

export const EMPTY_RING_TRACKER: RingTracker = { seen: null, ringing: new Map() };

export interface RingTicketLike {
  id: string;
  status: string;
}

/**
 * The next ring state after a board snapshot.
 *
 * `undefined` = the orders query has not answered; it must not be read as an
 * empty board (that made every ticket on the first real snapshot look new —
 * the same trap `scanNewTickets` documents). The first answered snapshot is
 * adopted silently: tickets already there when the cook walked up are backlog.
 */
export function trackRinging(
  prev: RingTracker,
  tickets: readonly RingTicketLike[] | undefined,
  nowMs: number,
): RingTracker {
  if (tickets === undefined) return prev;

  const seen = new Set(tickets.map((ticket) => ticket.id));
  if (prev.seen === null) return { seen, ringing: new Map() };

  const previousSeen = prev.seen;
  const ringing = new Map<string, number>();
  for (const ticket of tickets) {
    if (ticket.status !== AWAITING_KITCHEN_STATUS) continue;
    const rangAt = prev.ringing.get(ticket.id);
    if (rangAt !== undefined) {
      ringing.set(ticket.id, rangAt);
    } else if (!previousSeen.has(ticket.id)) {
      ringing.set(ticket.id, nowMs);
    }
  }
  return { seen, ringing };
}

/** A stable key of what is ringing, for effect dependencies. */
export function ringingIdsKey(tracker: RingTracker): string {
  return [...tracker.ringing.keys()].sort().join("\u0000");
}

export function kitchenTicketStatus(status: string, isRinging: boolean): KitchenTicketStatus {
  if (status !== AWAITING_KITCHEN_STATUS) return "confirmed";
  return isRinging ? "ringing" : "waiting";
}

export type ConfirmWritePlan =
  | { shouldWrite: true; status: typeof KITCHEN_CONFIRMED_STATUS }
  | { shouldWrite: false };

/**
 * Whether a Confirm tap writes anything, given the order's status (the
 * server's, else the board's). Only a `confirmed` order moves: writing
 * `preparing` over `ready` would pull a finished plate back onto the board.
 */
export function confirmWritePlan(previousStatus: string | undefined): ConfirmWritePlan {
  return previousStatus === AWAITING_KITCHEN_STATUS
    ? { shouldWrite: true, status: KITCHEN_CONFIRMED_STATUS }
    : { shouldWrite: false };
}

// ── Cashier side ────────────────────────────────────────────────────────────

export interface ConfirmableOrder {
  _id: string;
  status: string;
  customerName?: string;
  dailyNumber?: number | null;
  customerData?: unknown;
}

export interface KitchenConfirmationScan<O extends ConfirmableOrder> {
  /** Order id → status, to carry into the next scan; null = none answered. */
  statuses: ReadonlyMap<string, string> | null;
  /** Orders the kitchen confirmed since the last scan. */
  confirmed: O[];
}

function latestById<O extends ConfirmableOrder>(orders: readonly O[]): Map<string, O> {
  const byId = new Map<string, O>();
  for (const order of orders) {
    const known = byId.get(order._id);
    if (!known || (STATUS_RANK[order.status] ?? 0) >= (STATUS_RANK[known.status] ?? 0)) {
      byId.set(order._id, order);
    }
  }
  return byId;
}

/**
 * Orders that went from waiting on the kitchen to the kitchen having them,
 * between two snapshots of the live queue. The first snapshot reports nothing
 * (it is history, not news); `ownIds` are this device's own taps.
 */
export function detectKitchenConfirmations<O extends ConfirmableOrder>(
  prev: ReadonlyMap<string, string> | null,
  orders: readonly O[] | undefined,
  ownIds: ReadonlySet<string>,
): KitchenConfirmationScan<O> {
  if (orders === undefined) return { statuses: prev, confirmed: [] };

  const latest = latestById(orders);
  const statuses = new Map([...latest].map(([id, order]) => [id, order.status]));
  if (prev === null) return { statuses, confirmed: [] };

  const confirmed = [...latest.values()].filter(
    (order) =>
      prev.get(order._id) === AWAITING_KITCHEN_STATUS &&
      KITCHEN_HAS_IT.includes(order.status) &&
      !ownIds.has(order._id),
  );
  return { statuses, confirmed };
}

export interface KitchenConfirmationMessage {
  title: string;
  body: string;
}

export function formatKitchenConfirmation(order: ConfirmableOrder): KitchenConfirmationMessage {
  const ref = formatDailyOrderNumber(order.dailyNumber, order._id);
  const table = getOrderTableNumber(order.customerData);
  const name = displayCustomerName(order.customerName);
  return {
    title: `Kitchen confirmed ${ref}`.trim(),
    body: table ? `${name} · Table ${table}` : name,
  };
}

export interface KitchenConfirmationAudience extends OrderSessionFields {
  isDemo: boolean;
  caller: StaffPermissionHolder;
}

/**
 * Who hears "Kitchen confirmed": anyone who takes orders at the counter
 * (register or order queue) on a live store. Kitchen-only staff did the
 * confirming; the read-only demo stays silent.
 */
export function shouldShowKitchenConfirmations(audience: KitchenConfirmationAudience): boolean {
  if (audience.isDemo || !hasLiveOrderBackend(audience)) return false;
  return hasAnyPermission(audience.caller, ["pos", "orders"]);
}
