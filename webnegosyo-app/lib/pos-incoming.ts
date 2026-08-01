/**
 * The Register's view of orders arriving from somewhere other than this till.
 *
 * Pure and side-effect free: the screen subscribes to the same live queue the
 * dashboard uses and hands the raw buckets here. Keeping the "what counts as
 * incoming?" rule in one place means the drawer, the badge, and the handle can
 * never disagree with each other — or with the ringtone.
 */

import { selectNewOrders, formatOrderAlertBody } from "./order-alerts-utils";

/** The subset of an order row the drawer needs. */
export interface IncomingOrder {
  _id: string;
  _creationTime?: number;
  source?: string;
  status?: string;
  customerName?: string;
  total?: number;
  itemCount?: number;
}

/** `orders:getRealtimeQueue` shape — open orders bucketed by status. */
export type RealtimeQueue = Record<string, IncomingOrder[] | undefined> | undefined;

/** Rows rendered at most, so a backlog cannot mount an unbounded list. */
export const INCOMING_LIMIT = 20;

/**
 * Sources the register creates itself. A sale the cashier rang up seconds ago
 * is not news to them, and echoing it back as "incoming" would train them to
 * ignore the badge.
 */
const COUNTER_SOURCES: readonly string[] = ["pos"];

function isFromThisRegister(order: IncomingOrder): boolean {
  // An unrecorded source (older rows, written before the column existed) is not
  // provably a counter sale. Showing a stale order beats hiding a live one.
  return order.source !== undefined && COUNTER_SOURCES.includes(order.source);
}

/**
 * Every open order that came from anywhere but this register, newest first.
 *
 * All statuses are flattened together: to the cashier, an order the kitchen has
 * already confirmed is still something that arrived while they were ringing up
 * a walk-in.
 */
export function selectIncomingOrders(
  queue: RealtimeQueue,
  limit: number = INCOMING_LIMIT,
): IncomingOrder[] {
  if (!queue) return [];

  const seen = new Set<string>();
  const flattened = Object.values(queue).reduce<IncomingOrder[]>((acc, bucket) => {
    if (!Array.isArray(bucket)) return acc;

    // A status change between two reads of a polled backend can land the same
    // row in two buckets; the cashier must still see it once.
    const fresh = bucket.filter((order) => {
      if (seen.has(order._id) || isFromThisRegister(order)) return false;
      seen.add(order._id);
      return true;
    });

    return [...acc, ...fresh];
  }, []);

  return [...flattened]
    .sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0))
    .slice(0, limit);
}

/**
 * How many of these the cashier has not acknowledged yet.
 *
 * `seenIds === null` is the first snapshot after mount — everything already on
 * screen counts as seen, so the badge never opens dirty on a store that simply
 * has a busy queue.
 */
export function countUnseenIncoming(
  seenIds: Set<string> | null,
  orders: readonly IncomingOrder[] | undefined,
): number {
  return selectNewOrders(seenIds, orders).length;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The collapsed handle's label. Leads with what is new, because that is the
 * only reason to look up from the sale in progress.
 */
export function formatIncomingHandle(unseenCount: number, openCount: number): string {
  if (unseenCount > 0) return `${plural(unseenCount, "new order")}`;
  if (openCount > 0) return `${plural(openCount, "order")} coming in`;
  return "No orders coming in";
}

/** One row's summary, e.g. "Maria — ₱250.00 (3 items)". */
export function describeIncomingOrder(order: IncomingOrder): string {
  return formatOrderAlertBody(order);
}
