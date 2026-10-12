/**
 * A store's tax registration and Senior/PWD rules, as both apps read them from
 * `store_tax_profiles`.
 *
 * One mapper for both readers (the register and the server that verifies its
 * grants), so the same row can never mean two different rules.
 */

import { effectiveEnabledKinds } from './rules'
import type { GovDiscountKind, ServiceChargeMode, VatStatus } from './types'

export type ApprovalRule = 'never' | 'above' | 'always'

export interface TaxProfile {
  vatStatus: VatStatus
  registeredName: string | null
  tin: string | null
  tinBranchCode: string | null
  businessAddress: string | null
  isBirRegisteredPos: boolean
  posMin: string | null
  posSerialNo: string | null
  posPtuNo: string | null
  enabledKinds: GovDiscountKind[]
  allowSharedTable: boolean
  approvalRule: ApprovalRule
  approvalThreshold: number
  serviceChargeMode: ServiceChargeMode
}

/** The recommended defaults a new profile starts from. */
export const DEFAULT_APPROVAL_THRESHOLD = 500

export function defaultTaxProfile(vatStatus: VatStatus): TaxProfile {
  return {
    vatStatus,
    registeredName: null,
    tin: null,
    tinBranchCode: null,
    businessAddress: null,
    isBirRegisteredPos: false,
    posMin: null,
    posSerialNo: null,
    posPtuNo: null,
    enabledKinds: effectiveEnabledKinds(null),
    allowSharedTable: true,
    approvalRule: 'above',
    approvalThreshold: DEFAULT_APPROVAL_THRESHOLD,
    serviceChargeMode: 'full',
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** The row's snake_case columns → the profile. Null for a row that is not one. */
export function taxProfileFromRow(row: unknown): TaxProfile | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  if (r.vat_status !== 'vat' && r.vat_status !== 'non_vat') return null

  const threshold = Number(r.approval_threshold)
  const rule = r.approval_rule
  return {
    vatStatus: r.vat_status,
    registeredName: text(r.registered_name),
    tin: text(r.tin),
    tinBranchCode: text(r.tin_branch_code),
    businessAddress: text(r.business_address),
    isBirRegisteredPos: r.is_bir_registered_pos === true,
    posMin: text(r.pos_min),
    posSerialNo: text(r.pos_serial_no),
    posPtuNo: text(r.pos_ptu_no),
    enabledKinds: effectiveEnabledKinds(Array.isArray(r.enabled_kinds) ? r.enabled_kinds : null),
    allowSharedTable: r.allow_shared_table !== false,
    approvalRule: rule === 'never' || rule === 'always' ? rule : 'above',
    approvalThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_APPROVAL_THRESHOLD,
    serviceChargeMode: r.service_charge_mode === 'exempt_share' ? 'exempt_share' : 'full',
  }
}

/** The columns a profile writes (owner-only, see the migration). */
export function taxProfileToRow(profile: TaxProfile): Record<string, unknown> {
  return {
    vat_status: profile.vatStatus,
    registered_name: profile.registeredName,
    tin: profile.tin,
    tin_branch_code: profile.tinBranchCode,
    business_address: profile.businessAddress,
    is_bir_registered_pos: profile.isBirRegisteredPos,
    pos_min: profile.posMin,
    pos_serial_no: profile.posSerialNo,
    pos_ptu_no: profile.posPtuNo,
    enabled_kinds: profile.enabledKinds,
    allow_shared_table: profile.allowSharedTable,
    approval_rule: profile.approvalRule,
    approval_threshold: profile.approvalThreshold,
    service_charge_mode: profile.serviceChargeMode,
  }
}

/** The columns every reader selects, named so a missing one fails loudly. */
export const TAX_PROFILE_COLUMNS = [
  'vat_status',
  'registered_name',
  'tin',
  'tin_branch_code',
  'business_address',
  'is_bir_registered_pos',
  'pos_min',
  'pos_serial_no',
  'pos_ptu_no',
  'enabled_kinds',
  'allow_shared_table',
  'approval_rule',
  'approval_threshold',
  'service_charge_mode',
].join(', ')

/**
 * Does this grant need a manager? Senior/PWD is owed regardless, so this
 * never blocks the sale on its own — the register asks for a PIN, and when it
 * cannot reach the server the sale goes through flagged for review.
 */
export function needsManagerApproval(profile: TaxProfile, totalReduction: number): boolean {
  if (totalReduction <= 0) return false
  if (profile.approvalRule === 'always') return true
  if (profile.approvalRule === 'never') return false
  return totalReduction > profile.approvalThreshold
}

/**
 * "VAT REG TIN 123-456-789-00000" / "NON-VAT REG TIN …" — the header line an
 * invoice needs. Null without a TIN.
 */
export function tinHeaderLine(profile: TaxProfile): string | null {
  if (!profile.tin) return null
  const branch = profile.tinBranchCode ? `-${profile.tinBranchCode}` : ''
  const prefix = profile.vatStatus === 'vat' ? 'VAT REG TIN' : 'NON-VAT REG TIN'
  return `${prefix} ${profile.tin}${branch}`
}

/**
 * RR 7-2024 §6(B.15): a printout from a system without a Permit To Use is a
 * supplementary document and must say so, in bold.
 */
export const NOT_AN_INVOICE_NOTICE = 'THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.'
