/**
 * Applying an account's branch to the queries that read orders.
 *
 * The filter belongs in the query rather than in the page that renders its
 * result. A branch account should not receive another branch's rows at all,
 * and pagination makes the difference visible: filtering after the fact would
 * hand back a "page" of 20 rows with 3 of them visible, over a total count
 * describing a store the account cannot see.
 *
 * Split from `branch-scope.ts` because these functions touch a query builder
 * and throw, while that module is pure data. The rules themselves still live
 * there; this is only how they are applied.
 */

import { isOrderInScope, type BranchScope } from './branch-scope'
import type { OutletOrderLike } from './order-outlet-display'

/** The one query-builder method this needs, so a fake can stand in for it. */
export interface EqQuery<T> {
  eq(column: string, value: unknown): T
}

/**
 * Narrow an orders query to the account's branch.
 *
 * Applies only to the `orders.outlet_id` column, which exists on the platform
 * database. Backends that carry the branch in `customer_data` cannot filter in
 * the query and use `scopeOrderRows` on the result instead.
 */
export function scopeOrdersQuery<T extends EqQuery<T>>(query: T, scope: BranchScope): T {
  if (scope.kind === 'all') return query
  return query.eq('outlet_id', scope.outletId)
}

/**
 * Guard a single fetched order.
 *
 * Deliberately reports "not found" rather than "forbidden": a distinct refusal
 * would confirm to a branch account which order ids exist at the other
 * branches.
 */
export function assertOrderInScope(
  order: OutletOrderLike | null | undefined,
  scope: BranchScope
): void {
  if (isOrderInScope(scope, order)) return
  throw new Error('Order not found')
}

/**
 * Narrow already-fetched rows to the account's branch — the fallback for
 * backends whose branch lives in `customer_data` and cannot be filtered in SQL.
 */
export function scopeOrderRows<T extends OutletOrderLike>(
  rows: readonly T[],
  scope: BranchScope
): readonly T[] {
  if (scope.kind === 'all') return rows
  return rows.filter((row) => isOrderInScope(scope, row))
}
