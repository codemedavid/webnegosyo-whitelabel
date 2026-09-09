/**
 * Whether an order type may be ordered from the web storefront / customer app.
 *
 * `available_on_web` was added after order types shipped, so a row read
 * through an older projection (undefined) or a null value must keep the
 * type orderable — only an explicit `false` refuses. The storefront query
 * filters the column; `createOrderAction` re-checks it so a stale tab or a
 * direct call cannot order a POS-only channel.
 */

export const WEB_UNAVAILABLE_ORDER_TYPE_MESSAGE =
  'This order type is not available for online ordering'

export interface WebAvailabilityRow {
  available_on_web?: boolean | null
}

export function isOrderTypeOrderableOnWeb(
  row: WebAvailabilityRow | null | undefined
): boolean {
  return row?.available_on_web !== false
}
