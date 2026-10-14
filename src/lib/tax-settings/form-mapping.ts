/**
 * Form ⇄ profile. The form holds what the owner typed (strings, a TIN with
 * or without its branch part); the profile is what `store_tax_profiles`
 * stores and every register reads through `taxProfileFromRow`.
 */

import {
  DEFAULT_APPROVAL_THRESHOLD,
  GOV_DISCOUNT_KINDS,
  defaultTaxProfile,
  effectiveEnabledKinds,
  isMandatoryKind,
  type GovDiscountKind,
  type TaxProfile,
  type VatStatus,
} from '@/lib/gov-discount'
import type { TaxSettingsFormValues } from './form-schema'
import { formatTinInput, splitTin } from './tin'

/** The kinds an owner may switch; Senior and PWD are always on. */
export const OPTIONAL_GOV_KINDS: readonly GovDiscountKind[] = GOV_DISCOUNT_KINDS.filter(
  (kind) => !isMandatoryKind(kind),
)

/**
 * The form's starting values. A store without a profile starts from the
 * recommended defaults but WITHOUT a VAT status: that choice decides the
 * discount arithmetic, so the owner makes it rather than inheriting a guess.
 */
export type TaxSettingsFormDefaults = Omit<TaxSettingsFormValues, 'vatStatus'> & {
  vatStatus?: VatStatus
}

function joinTin(profile: TaxProfile): string {
  if (!profile.tin) return ''
  return formatTinInput(profile.tin)
}

export function formValuesFromProfile(profile: TaxProfile | null): TaxSettingsFormDefaults {
  const source = profile ?? defaultTaxProfile('vat')
  return {
    vatStatus: profile?.vatStatus,
    registeredName: source.registeredName ?? '',
    tin: joinTin(source),
    tinBranchCode: source.tinBranchCode ?? '',
    businessAddress: source.businessAddress ?? '',
    isBirRegisteredPos: source.isBirRegisteredPos,
    posMin: source.posMin ?? '',
    posSerialNo: source.posSerialNo ?? '',
    posPtuNo: source.posPtuNo ?? '',
    enabledKinds: [...source.enabledKinds],
    allowSharedTable: source.allowSharedTable,
    approvalRule: source.approvalRule,
    approvalThreshold: String(source.approvalThreshold),
    serviceChargeMode: source.serviceChargeMode,
    idPhotoMode: source.idPhotoMode,
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toThreshold(raw: string): number {
  const amount = Number(raw.trim())
  if (raw.trim() === '' || !Number.isFinite(amount) || amount < 0) return DEFAULT_APPROVAL_THRESHOLD
  return Math.round(amount * 100) / 100
}

/**
 * Validated form values → the profile to store. A branch code typed after
 * the TIN moves into its own column, so the receipt header never prints it
 * twice (`tinHeaderLine` appends the branch code to the TIN).
 */
export function profileFromFormValues(values: TaxSettingsFormValues): TaxProfile {
  const { base, branch } = splitTin(values.tin)
  return {
    vatStatus: values.vatStatus,
    registeredName: orNull(values.registeredName),
    tin: orNull(base),
    tinBranchCode: orNull(branch) ?? orNull(values.tinBranchCode),
    businessAddress: orNull(values.businessAddress),
    isBirRegisteredPos: values.isBirRegisteredPos,
    posMin: orNull(values.posMin),
    posSerialNo: orNull(values.posSerialNo),
    posPtuNo: orNull(values.posPtuNo),
    enabledKinds: effectiveEnabledKinds(values.enabledKinds),
    allowSharedTable: values.allowSharedTable,
    approvalRule: values.approvalRule,
    approvalThreshold: toThreshold(values.approvalThreshold),
    serviceChargeMode: values.serviceChargeMode,
    idPhotoMode: values.idPhotoMode,
  }
}

/** Switches one optional kind on or off, keeping the mandatory ones. */
export function toggleKind(
  kinds: readonly GovDiscountKind[],
  kind: GovDiscountKind,
  isOn: boolean,
): GovDiscountKind[] {
  if (isMandatoryKind(kind)) return effectiveEnabledKinds(kinds)
  const rest = kinds.filter((existing) => existing !== kind)
  return effectiveEnabledKinds(isOn ? [...rest, kind] : rest)
}
