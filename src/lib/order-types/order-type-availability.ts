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

export interface ChannelAvailabilityRow extends WebAvailabilityRow {
  available_on_pos?: boolean | null
}

/** The register-side twin of {@link isOrderTypeOrderableOnWeb}. */
export function isOrderTypeOrderableOnPos(
  row: ChannelAvailabilityRow | null | undefined
): boolean {
  return row?.available_on_pos !== false
}

/**
 * A short qualifier naming the one channel an order type is limited to, or
 * null when it runs on both.
 *
 * Admin surfaces that list every order type regardless of channel — the
 * payment-method editor above all — need this: "Grab" and "Delivery" are
 * indistinguishable as bare names, and a merchant who cannot tell a
 * register-only channel from an online one cannot tell which methods they are
 * really turning on. A row that predates either column counts as both.
 */
export function describeOrderTypeChannel(
  row: ChannelAvailabilityRow | null | undefined
): string | null {
  const onWeb = isOrderTypeOrderableOnWeb(row)
  const onPos = isOrderTypeOrderableOnPos(row)

  if (onWeb && onPos) return null
  return onPos ? 'Register only' : 'Online only'
}
