/**
 * Which devices a new-order notification should ring.
 *
 * Deliberately free of Convex imports so it can be unit-tested by the platform
 * repo's Jest run (`convex-template/convex/pushRecipients.test.ts`) rather than
 * only exercised by a deployed backend.
 *
 * Why this lives on the backend at all: every other branch narrowing in this
 * product happens on the device, because the device knows its own branch. A
 * notification is the exception — a phone cannot un-ring one it has already
 * received. So the fan-out has to be decided before the push is sent.
 *
 * Every rule here fails toward *noise* rather than silence. One extra buzz is
 * an annoyance; a notification that reaches nobody loses the order.
 */

/** The branch key `withOrderOutlet` stamps into `customerData`. */
const ORDER_OUTLET_ID_KEY = "outlet_id";

/** A registered device, as far as the recipient rule is concerned. */
export interface PushTokenLike {
  token: string;
  /**
   * The branch this device is bound to.
   *
   * Absent means store-wide: an owner's device, or one registered by an app
   * build that predates branch-aware registration. Both must keep hearing
   * everything.
   */
  outletId?: string | null;
}

/** A branch id, or null when there is effectively none. */
function normalizeOutletId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The branch an order belongs to, read off the payload the storefront and the
 * register both write.
 *
 * The branch rides inside `customerData` rather than a column because tenants
 * run schemas this app cannot migrate on demand — see `order-outlet.ts` in
 * either app for the full reasoning.
 */
export function orderOutletIdFromCustomerData(
  customerData: unknown,
): string | null {
  if (typeof customerData !== "object" || customerData === null) return null;

  const blob = customerData as Record<string, unknown>;
  return normalizeOutletId(blob[ORDER_OUTLET_ID_KEY]);
}

/** An order as far as branch attribution is concerned. */
export interface BranchedOrderLike {
  outletId?: string | null;
  customerData?: unknown;
}

/**
 * The branch an order belongs to, from the column or — failing that — the blob.
 *
 * v15 promotes the branch into a real `outletId` field, but every order already
 * in a tenant's database has only `customerData.outlet_id`. Reading the column
 * alone would *hide* every existing branch order from the branch that took it —
 * the same trap the platform backend hit, where a naive `.eq('outlet_id')` would
 * have hidden every counter sale. Both live orders on the only multi-branch
 * tenant are blob-only today, so this fallback is load-bearing from day one, not
 * defensive padding.
 */
export function resolveOrderOutletId(order: BranchedOrderLike): string | null {
  return (
    normalizeOutletId(order.outletId) ??
    orderOutletIdFromCustomerData(order.customerData)
  );
}

/**
 * The subset of `orders` belonging to `outletId`, or all of them if none given.
 *
 * An order with no branch is excluded from a branch view: it belongs to no
 * branch, and showing it to a manager would surface a sale they cannot act on.
 * Note the asymmetry with `recipientsForOutlet`, which *includes* unbranched
 * orders — a missed notification loses an order, whereas a row missing from a
 * list is still reachable from the store-wide view.
 */
export function filterOrdersToOutlet<T extends BranchedOrderLike>(
  orders: readonly T[],
  outletId: string | null | undefined,
): T[] {
  const wanted = normalizeOutletId(outletId);
  if (wanted === null) return [...orders];

  return orders.filter((order) => resolveOrderOutletId(order) === wanted);
}

/**
 * The devices to ring for an order from `orderOutletId`.
 *
 * Two openings, both intentional:
 * - A device with no branch hears every branch. That is what makes an owner's
 *   phone work, and it is also what stops this change from silencing every
 *   device already registered by an older build.
 * - An order with no branch rings every device. A single-location store stamps
 *   no branch, so filtering it would deliver to nobody — this preserves exactly
 *   today's behaviour for them.
 *
 * Input order is preserved so the caller's push batch stays predictable.
 */
export function recipientsForOutlet<T extends PushTokenLike>(
  tokens: readonly T[],
  orderOutletId: string | null | undefined,
): T[] {
  const orderOutlet = normalizeOutletId(orderOutletId);
  if (orderOutlet === null) return [...tokens];

  return tokens.filter((doc) => {
    const deviceOutlet = normalizeOutletId(doc.outletId);
    return deviceOutlet === null || deviceOutlet === orderOutlet;
  });
}
