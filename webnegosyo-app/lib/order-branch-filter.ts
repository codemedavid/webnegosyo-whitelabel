/**
 * Narrowing the order list to one branch — or to the orders belonging to none.
 *
 * Deliberately NOT part of `branch-scope.ts`. That module answers a question
 * about the ACCOUNT — which orders this person is permitted to see — and is a
 * boundary. This one answers a question about the SCREEN: of the orders already
 * in hand, which is the merchant looking at right now. Keeping them apart is
 * what stops a view preference from ever being mistaken for permission.
 *
 * The branch comes off each order exactly as `branch-scope` reads it, so the
 * two never disagree about which branch took a sale. Options are derived from
 * the orders on screen rather than queried, which means a single-location store
 * yields none and its screen is untouched.
 */

import { getOrderOutletId } from "./branch-scope";
import { ORDER_OUTLET_NAME_KEY } from "./order-outlet";

/** Every order the account may see. */
export const ORDER_BRANCH_FILTER_ALL = "all";

/**
 * The orders that name no branch: placed before the branches existed, by a
 * customer who never passed the chooser, or by a path that does not carry one.
 * Prefixed so it can never collide with a branch id, which is a uuid.
 */
export const ORDER_BRANCH_FILTER_UNASSIGNED = "__unassigned__";

export interface OrderBranchOption {
  id: string;
  name: string;
}

interface LabelledOrderLike {
  customerData?: unknown;
}

/** The branch name recorded on the order, or null when none was. */
function getOrderOutletName(order: LabelledOrderLike): string | null {
  const blob = order.customerData;
  if (typeof blob !== "object" || blob === null || Array.isArray(blob)) return null;

  const value = (blob as Record<string, unknown>)[ORDER_OUTLET_NAME_KEY];
  const name = typeof value === "string" ? value.trim() : "";
  return name === "" ? null : name;
}

/**
 * The branches worth offering, sorted by name.
 *
 * A branch whose name was never recorded is skipped — an option with no label
 * is unusable, and its orders still appear unfiltered and under "Unassigned"
 * only if they carry no id either.
 */
export function listOrderBranchOptions(
  orders: readonly object[] | null | undefined,
): OrderBranchOption[] {
  const byId = new Map<string, string>();

  for (const order of orders ?? []) {
    const id = getOrderOutletId(order as never);
    const name = getOrderOutletName(order as LabelledOrderLike);
    if (!id || !name) continue;
    // First one wins. Orders arrive newest-first, so a renamed branch is
    // offered under the name it goes by now.
    if (!byId.has(id)) byId.set(id, name);
  }

  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Whether this merchant has any order that names no branch. */
export function hasUnassignedOrders(orders: readonly object[] | null | undefined): boolean {
  return (orders ?? []).some((order) => getOrderOutletId(order as never) === null);
}

/** The orders the chosen filter is asking for. */
export function filterOrdersToBranchFilter<T extends object>(
  filterId: string,
  orders: readonly T[] | null | undefined,
): T[] {
  const rows = orders ?? [];
  if (filterId === ORDER_BRANCH_FILTER_ALL) return [...rows];
  if (filterId === ORDER_BRANCH_FILTER_UNASSIGNED) {
    return rows.filter((order) => getOrderOutletId(order as never) === null);
  }
  return rows.filter((order) => getOrderOutletId(order as never) === filterId);
}
