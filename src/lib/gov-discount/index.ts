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
export {
  DEFAULT_APPROVAL_THRESHOLD,
  NOT_AN_INVOICE_NOTICE,
  TAX_PROFILE_COLUMNS,
  defaultTaxProfile,
  needsManagerApproval,
  taxProfileFromRow,
  taxProfileToRow,
  tinHeaderLine,
  type ApprovalRule,
  type TaxProfile,
} from './tax-profile'
export {
  GOV_FLAGS,
  isGovFlag,
  needsReview,
  sortFlags,
  type GovFlag,
  type GovFlagInfo,
  type GovFlagSeverity,
} from './flags'
export {
  MAX_LEDGER_LINES,
  type GovLedgerBackend,
  type GovLedgerLine,
  type RecordGovDiscountRequest,
} from './ledger-request'
