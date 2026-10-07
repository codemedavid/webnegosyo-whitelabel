/**
 * Arranging dishes within one category.
 *
 * `menu_items.order` is what the storefront AND the register (merchant app
 * POS) sort by, so one arrangement drives both — there is no separate POS
 * order to drift from the web's.
 *
 * Live stores carry many tied positions (thousands of dishes at 0), and a tie
 * sorts however the database feels like. Every arrangement therefore renumbers
 * the whole category 0..n, which is what makes the order total.
 */

export interface ItemPosition {
  id: string
  order: number
}

export type ArrangementPlan =
  | { ok: true; writes: ItemPosition[] }
  | { ok: false; error: string }

export const STALE_ARRANGEMENT_ERROR =
  'Your menu changed since this page loaded. Refresh the page and try again.'

/**
 * The writes that put `requestedIds` in order, or a refusal when they are not
 * exactly the category's dishes.
 *
 * A request that misses a dish (added from the app since the page loaded) or
 * names one that moved away would leave two dishes sharing a position, so it
 * is refused rather than half-applied. Only dishes whose position actually
 * changes are written.
 */
export function planItemArrangement(
  current: readonly ItemPosition[],
  requestedIds: readonly string[],
): ArrangementPlan {
  const currentOrder = new Map(current.map((item) => [item.id, item.order]))
  const isExactPermutation =
    requestedIds.length === current.length &&
    new Set(requestedIds).size === requestedIds.length &&
    requestedIds.every((id) => currentOrder.has(id))

  if (!isExactPermutation) return { ok: false, error: STALE_ARRANGEMENT_ERROR }

  const writes = requestedIds
    .map((id, order) => ({ id, order }))
    .filter(({ id, order }) => currentOrder.get(id) !== order)

  return { ok: true, writes }
}

/** The position a dish takes when it joins a category: after everything there. */
export function nextItemOrder(orders: readonly number[]): number {
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}
