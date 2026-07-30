/**
 * Which branch an order belongs to, as the merchant app writes it.
 *
 * This is the mobile mirror of `src/lib/outlets/order-outlet.ts` on the web.
 * The two apps are separate packages with no shared build, so the carrier keys
 * are duplicated rather than imported — the same arrangement
 * `staff-permissions.ts` and `order-backend.ts` already use. **Keep the two in
 * sync**: an order stamped under different keys by the register than by the
 * storefront would read as two different branches, or as none.
 *
 * The branch rides inside `customerData` rather than a column because Convex
 * and tenant-owned Supabase projects run schemas this app cannot migrate on
 * demand — the same reason the advance-order schedule and the payment proof
 * live there.
 */

/** Keys the branch travels under inside `customerData`. */
export const ORDER_OUTLET_ID_KEY = "outlet_id";
export const ORDER_OUTLET_NAME_KEY = "outlet_name";

/** A branch the app is willing to record against an order. */
export interface OrderOutletContext {
  id: string;
  name: string;
}

/**
 * The branch to credit a counter sale to, from the session's branch fields.
 *
 * The id is the attribution and the name is only a display snapshot, so an
 * unknown name falls back to the id rather than dropping the branch — the same
 * choice `branch-kpis` makes for its labels. Requiring both meant a failed
 * outlets lookup booked the sale to nobody while the session knew the branch.
 */
export function posOutletContext(
  outletId: string | null | undefined,
  outletName: string | null | undefined,
): OrderOutletContext | null {
  const id = typeof outletId === "string" ? outletId.trim() : "";
  if (id === "") return null;

  const name = typeof outletName === "string" ? outletName.trim() : "";
  return { id, name: name === "" ? id : name };
}

/**
 * Stamp the branch onto an order's `customerData`.
 *
 * With no branch the caller's payload is returned as it is — no added key — so
 * an order from a single-location store is byte-for-byte what it is today.
 */
export function withOrderOutlet(
  customerData: Record<string, unknown> | undefined,
  outlet: OrderOutletContext | null | undefined,
): Record<string, unknown> {
  if (!outlet) return { ...(customerData ?? {}) };

  return {
    ...(customerData ?? {}),
    // Written last so a caller-supplied `outlet_id` cannot survive.
    [ORDER_OUTLET_ID_KEY]: outlet.id,
    [ORDER_OUTLET_NAME_KEY]: outlet.name,
  };
}
