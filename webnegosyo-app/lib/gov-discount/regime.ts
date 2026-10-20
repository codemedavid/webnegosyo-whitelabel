/**
 * Government discount OR the store's own promos — never both.
 *
 * RA 9994 §4 and RR 7-2010 §5: a Senior/PWD may take the promo or the 20%,
 * whichever is higher, but not both. The register applies the higher one
 * automatically and tells the cashier which and by how much; on a tie the
 * government discount wins, because it is the one the law requires records
 * for and the one the store can deduct.
 */

export type DiscountRegime = 'government' | 'other'

export interface RegimeChoice {
  regime: DiscountRegime
  /** How much more the chosen regime saves, in pesos (0 on a tie). */
  advantage: number
}

export function chooseDiscountRegime(
  governmentReduction: number,
  otherReduction: number,
): RegimeChoice {
  const government = Number.isFinite(governmentReduction) ? Math.max(0, governmentReduction) : 0
  const other = Number.isFinite(otherReduction) ? Math.max(0, otherReduction) : 0
  const advantage = Math.round(Math.abs(government - other) * 100) / 100
  return other > government ? { regime: 'other', advantage } : { regime: 'government', advantage }
}
