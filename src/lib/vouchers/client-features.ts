/**
 * Which voucher features a register build understands.
 *
 * A unit-limited voucher ("50% off ONE fries") priced by a register that
 * predates the limit would discount every fries — the old engine ignores the
 * field. So the voucher routes withhold those vouchers from any caller that
 * does not announce it can price them. A new build sends the header; an old
 * one simply never sees the voucher and asks for an update instead of
 * over-discounting.
 */

import type { Voucher } from './types'

export const VOUCHER_FEATURES_HEADER = 'x-voucher-features'

/** The feature a client must announce to receive unit-limited vouchers. */
export const UNIT_LIMIT_FEATURE = 'units'

export function clientSupportsUnitLimits(headerValue: string | null | undefined): boolean {
  if (!headerValue) return false
  return headerValue
    .split(',')
    .map((feature) => feature.trim().toLowerCase())
    .includes(UNIT_LIMIT_FEATURE)
}

/** The vouchers this client may price: unit-limited ones only for new builds. */
export function vouchersForClient<T extends Pick<Voucher, 'maxDiscountedUnits'>>(
  vouchers: readonly T[],
  supportsUnitLimits: boolean,
): T[] {
  if (supportsUnitLimits) return [...vouchers]
  return vouchers.filter((voucher) => voucher.maxDiscountedUnits == null)
}
