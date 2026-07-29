/**
 * Which branch a merchant-app session may see.
 *
 * This mirrors `src/lib/outlets/branch-scope.ts` on the web. The two apps are
 * separate packages with no shared build, so the rules are duplicated rather
 * than imported — the arrangement `staff-permissions.ts`, `order-backend.ts`,
 * and `order-outlet.ts` already use. **Keep the two in sync.**
 *
 * It is deliberately NOT a blind copy. Orders reach this app from Convex,
 * where the blob is `customerData` (camelCase); the web module reads
 * `customer_data`, the platform-Supabase column name. Reading the wrong key
 * would hide every order from every branch account, and the symptom would look
 * like an empty store rather than a bug.
 *
 * Nothing here throws or queries: an order list is rendered from whatever the
 * backend returned, including `undefined` while a Convex query is still
 * loading.
 */

import { ORDER_OUTLET_ID_KEY } from "./order-outlet";

/** The session fields that decide what this account may see. */
export interface BranchScopedSession {
  /** Branch this session is confined to; null = the whole store. */
  outletId?: string | null;
  isOwner?: boolean | null;
  isSuperadmin?: boolean | null;
  isDemo?: boolean | null;
}

export type BranchScope = { kind: "all" } | { kind: "branch"; outletId: string };

/** An order as either backend hands it over. */
export interface ScopedOrderLike {
  /** Present on the platform-Supabase adapter's rows. */
  outlet_id?: string | null;
  /** Convex and tenant-owned projects carry the branch in here. */
  customerData?: unknown;
}

function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The branch this session is confined to, if any.
 *
 * Owners and superadmins are never confined — the cross-branch views exist for
 * them. A demo session is not either: it is a read-only tour of a sample store
 * and must show that store whole.
 */
export function resolveBranchScope(session: BranchScopedSession): BranchScope {
  if (session.isSuperadmin || session.isOwner || session.isDemo) return { kind: "all" };

  const outletId = trimmed(session.outletId);
  if (outletId === "") return { kind: "all" };

  return { kind: "branch", outletId };
}

/**
 * Which branch took this order.
 *
 * An explicit column wins over the blob: the platform adapter writes it from a
 * validated id, while the blob exists only so the other backends have
 * somewhere to put it.
 */
export function getOrderOutletId(order: ScopedOrderLike | null | undefined): string | null {
  if (!order) return null;

  const fromColumn = trimmed(order.outlet_id);
  if (fromColumn !== "") return fromColumn;

  const blob = order.customerData;
  if (typeof blob !== "object" || blob === null || Array.isArray(blob)) return null;

  const value = (blob as Record<string, unknown>)[ORDER_OUTLET_ID_KEY];
  const fromBlob = trimmed(typeof value === "string" ? value : null);
  return fromBlob === "" ? null : fromBlob;
}

/**
 * Whether this order is one the scope may see. An unattributed order is hidden
 * from a branch account: it was not taken by that branch.
 */
export function isOrderInScope(
  scope: BranchScope,
  order: ScopedOrderLike | null | undefined,
): boolean {
  if (scope.kind === "all") return true;
  return getOrderOutletId(order) === scope.outletId;
}

/**
 * The orders a scope may see.
 *
 * `undefined` — a Convex query that has not resolved yet — becomes an empty
 * list so screens can render a loading state without a null check at every
 * call site. An all-branch scope gets the caller's own array back rather than
 * a copy, since that is the overwhelmingly common case.
 */
export function filterOrdersToScope<T extends ScopedOrderLike>(
  scope: BranchScope,
  orders: readonly T[] | undefined,
): readonly T[] {
  if (!orders) return [];
  if (scope.kind === "all") return orders;
  return orders.filter((order) => isOrderInScope(scope, order));
}
