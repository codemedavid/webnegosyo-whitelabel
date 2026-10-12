/**
 * Re-pricing a register's Senior/PWD grant on the server.
 *
 * The register prices locally (it has to work offline), so what it reports is
 * a claim. This module prices the same claimants again — same engine, the
 * STORE's tax profile, the SERVER's view of which items are eligible — and
 * says where the two disagree. It never refuses: the customer has already
 * paid, so a disagreement becomes a flag for the owner, not a lost record.
 *
 * Pure. The record service feeds it what it read from the database.
 */

import {
  claimantInputsFromStored,
  computeGovDiscount,
  looksLikeUnusualPwdId,
  needsManagerApproval,
  type GovFlag,
  type GovLineInput,
  type RecordGovDiscountRequest,
  type TaxProfile,
} from '@/lib/gov-discount'

const TOLERANCE_PESOS = 0.01

export interface SavedOrderLine {
  menuItemId: string | null
  quantity: number
  amount: number
}

export interface VerifyGrantInput {
  request: RecordGovDiscountRequest
  profile: TaxProfile | null
  /** Menu items the store excluded (item or category switched off). */
  excludedMenuItemIds: ReadonlySet<string>
  /** The order's lines as saved, when the backend is one the server can read. */
  savedLines: readonly SavedOrderLine[] | null
  /** Whether a valid manager approval was consumed for this grant. */
  isApproved: boolean
  isSelfApproved: boolean
}

export interface ClaimantVerdict {
  claimantRef: string
  /** What the server would have taken off; null when it could not price it. */
  serverReduction: number | null
  flags: GovFlag[]
}

export interface GrantVerdict {
  verification: 'verified' | 'mismatch' | 'payload_only'
  claimants: ClaimantVerdict[]
  /** Flags that apply to the whole order (added to every claimant's row). */
  orderFlags: GovFlag[]
}

function lineSignature(line: SavedOrderLine): string {
  return `${line.menuItemId ?? '-'}|${line.quantity}|${Math.round(line.amount * 100)}`
}

/** The register's lines are the saved ones (as a multiset). */
export function linesMatch(
  reported: readonly SavedOrderLine[],
  saved: readonly SavedOrderLine[],
): boolean {
  if (reported.length !== saved.length) return false
  const a = reported.map(lineSignature).sort()
  const b = saved.map(lineSignature).sort()
  return a.every((signature, index) => signature === b[index])
}

function serverLines(
  request: RecordGovDiscountRequest,
  excluded: ReadonlySet<string>,
): GovLineInput[] {
  return request.lines.map((line) => ({
    key: line.key,
    name: line.name,
    quantity: line.quantity,
    amount: line.amount,
    eligible: line.menuItemId === null || !excluded.has(line.menuItemId),
  }))
}

function orderLevelFlags(input: VerifyGrantInput, linesDiffer: boolean): GovFlag[] {
  const { request, profile } = input
  const government = request.government
  const flags: GovFlag[] = []
  if (linesDiffer) flags.push('lines_differ')
  if (!profile) flags.push('no_tax_profile')
  if (profile && government && profile.vatStatus !== government.vatStatus) {
    flags.push('vat_status_changed')
  }
  if (request.revision > 0) flags.push('edited')

  const reduction = government?.claimants.reduce((sum, claimant) => sum + claimant.reduction, 0) ?? 0
  // Online orders are not approved by a PIN: the ID is checked at handover.
  const isPinApproved = request.source === 'pos'
  if (isPinApproved && profile && needsManagerApproval(profile, reduction) && !input.isApproved) {
    flags.push(request.approvalSkippedOffline ? 'unapproved_offline' : 'approval_missing')
  }
  if (input.isApproved && input.isSelfApproved) flags.push('self_approved')
  return flags
}

export function verifyGrant(input: VerifyGrantInput): GrantVerdict {
  const { request, profile } = input
  const government = request.government
  if (!government) return { verification: 'verified', claimants: [], orderFlags: [] }

  const linesDiffer =
    input.savedLines !== null && !linesMatch(request.lines, input.savedLines)

  const result = computeGovDiscount({
    vatStatus: profile?.vatStatus ?? government.vatStatus,
    lines: serverLines(request, input.excludedMenuItemIds),
    claimants: claimantInputsFromStored(government),
    diners: government.diners ?? undefined,
    allowShared: request.allowShared,
    enabledKinds: profile?.enabledKinds,
    serviceCharge: request.serviceCharge,
    serviceChargeMode: profile?.serviceChargeMode ?? government.serviceChargeMode,
    deliveryFee: request.deliveryFee,
  })

  const ineligibleRefused =
    !result.ok && result.problems.some((problem) => problem.code === 'ineligible_line')

  const claimants = government.claimants.map((claimant): ClaimantVerdict => {
    const flags: GovFlag[] = []
    if (looksLikeUnusualPwdId(claimant.kind, claimant.idNumber)) flags.push('unusual_id')

    if (!result.ok) {
      flags.push(ineligibleRefused ? 'ineligible_item' : 'amount_mismatch')
      return { claimantRef: claimant.id, serverReduction: null, flags }
    }
    const priced = result.claimants.find((candidate) => candidate.id === claimant.id)
    const serverReduction = priced ? priced.reduction : null
    if (serverReduction === null || Math.abs(serverReduction - claimant.reduction) > TOLERANCE_PESOS) {
      flags.push('amount_mismatch')
    }
    return { claimantRef: claimant.id, serverReduction, flags }
  })

  const isMismatch =
    linesDiffer || claimants.some((verdict) => verdict.flags.includes('amount_mismatch') || verdict.flags.includes('ineligible_item'))

  return {
    verification: isMismatch ? 'mismatch' : input.savedLines === null ? 'payload_only' : 'verified',
    claimants,
    orderFlags: orderLevelFlags(input, linesDiffer),
  }
}
