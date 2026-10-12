/**
 * Government-mandated discounts — public surface. See `types.ts` for the
 * vocabulary and the parity rule that keeps the merchant app's copy identical.
 */

export * from './types'
export * from './rules'
export {
  checkIdNumber,
  isClaimantNameValid,
  looksLikeUnusualPwdId,
  maskIdNumber,
  normalizeClaimantName,
  normalizeIdNumber,
  shortClaimantName,
} from './claimant-id'
export { unclaimedUnits } from './allocation'
export { computeGovDiscount } from './compute'
export { saleVatBreakdown, type SaleVatInput } from './sale-vat'
export {
  GOV_PAYLOAD_VERSION,
  claimantInputsFromStored,
  govDiscountLines,
  readStoredGovDiscount,
  type GovDiscountLine,
  type StoredGovDiscount,
} from './payload'
export { chooseDiscountRegime, type DiscountRegime, type RegimeChoice } from './regime'
