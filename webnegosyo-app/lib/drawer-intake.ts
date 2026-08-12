/**
 * The Drawer's view of orders arriving from somewhere other than this till,
 * and whether the cashier may accept one from here.
 *
 * Pure and side-effect free. The selection rule is deliberately borrowed from
 * `pos-incoming` rather than re-stated: the Register's sheet and the Drawer's
 * intake list must never disagree about what "incoming" means, or a cashier
 * who confirms in one place will still see the order waiting in the other.
 */

import { selectIncomingOrders, type IncomingOrder, type RealtimeQueue } from "./pos-incoming";

/** The subset of an order row the Drawer's intake list needs. */
export interface DrawerOrder extends IncomingOrder {
  status?: string;
}

/**
 * Backends that accept order writes. A per-tenant Supabase project is read-only
 * to this app, so a Confirm button there must be refused up front rather than
 * failing at the tap.
 */
const WRITABLE_BACKENDS: readonly string[] = ["convex", "platform"];

/** The only status an order can be confirmed FROM. */
const CONFIRMABLE_STATUS = "pending";

/** Why a confirm was refused, or that it may proceed. */
export type ConfirmGate = { ok: true } | { ok: false; reason: string };

/**
 * Every open order that came from anywhere but this register, newest first.
 *
 * A thin alias today, but a named one: the Drawer asks a different question
 * from the Register's sheet ("what can I accept?" vs "what arrived while I was
 * ringing up?"), and giving it its own entry point means the two can diverge
 * later without one silently changing the other.
 */
export function selectDrawerIncoming(queue: RealtimeQueue, limit?: number): DrawerOrder[] {
  return selectIncomingOrders(queue, limit);
}

/**
 * Whether the cashier may confirm this order from the Drawer.
 *
 * Returns a reason rather than a bare boolean so the screen can say what is
 * wrong instead of rendering a dead button — the same shape `canEnterEditMode`
 * uses for the register.
 */
export function canConfirmFromDrawer(order: DrawerOrder, backend: string): ConfirmGate {
  if (!WRITABLE_BACKENDS.includes(backend)) {
    return {
      ok: false,
      reason: "This store's order backend is read-only in the app — confirm on the web dashboard.",
    };
  }

  if (order.status === "cancelled") {
    return { ok: false, reason: "This order was cancelled." };
  }

  if (order.status !== CONFIRMABLE_STATUS) {
    return { ok: false, reason: "Already confirmed — it is moving through the kitchen." };
  }

  return { ok: true };
}
