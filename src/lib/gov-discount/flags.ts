/**
 * The reasons a recorded Senior/PWD grant is put in front of the owner.
 *
 * Every grant is recorded; a flag only says "look at this one". The server
 * raises them while recording (see `src/lib/gov-discount-ledger/verify.ts`)
 * and both apps show them with these words.
 */

export type GovFlag =
  | 'amount_mismatch'
  | 'lines_differ'
  | 'ineligible_item'
  | 'no_tax_profile'
  | 'vat_status_changed'
  | 'approval_missing'
  | 'unapproved_offline'
  | 'self_approved'
  | 'id_reused_today'
  | 'unusual_id'
  | 'edited'
  | 'unverified_order'
  | 'reversal_unverified'
  | 'clock_ahead'
  | 'late_sync'
  | 'recorded_after_cancel'
  | 'superseded_late'

export type GovFlagSeverity = 'high' | 'medium' | 'low'

export interface GovFlagInfo {
  label: string
  /** One sentence the owner can act on. */
  explain: string
  severity: GovFlagSeverity
}

export const GOV_FLAGS: Readonly<Record<GovFlag, GovFlagInfo>> = {
  amount_mismatch: {
    label: 'Amount differs',
    explain: 'The register took off a different amount than the rules allow for this order.',
    severity: 'high',
  },
  lines_differ: {
    label: 'Items differ',
    explain: 'The items the discount was priced on do not match the saved order.',
    severity: 'high',
  },
  ineligible_item: {
    label: 'Excluded item',
    explain: 'The discount covered an item you excluded from Senior/PWD discounts.',
    severity: 'high',
  },
  approval_missing: {
    label: 'No approval',
    explain: 'This discount needed a manager’s PIN and none was given.',
    severity: 'high',
  },
  reversal_unverified: {
    label: 'Take-back not confirmed',
    explain: 'The discount was taken back, but the server could not confirm the order was really changed or cancelled.',
    severity: 'high',
  },
  unverified_order: {
    label: 'Order not checked',
    explain: 'This order lives outside the platform, so the server could not compare it with the saved order.',
    severity: 'medium',
  },
  clock_ahead: {
    label: 'Register clock ahead',
    explain: 'The register reported a time in the future, so the server’s time was recorded instead.',
    severity: 'medium',
  },
  id_reused_today: {
    label: 'ID used again today',
    explain: 'The same ID number was used on another order today — check it was the same person.',
    severity: 'medium',
  },
  unapproved_offline: {
    label: 'Approval skipped offline',
    explain: 'The register was offline, so the manager’s PIN could not be checked.',
    severity: 'medium',
  },
  vat_status_changed: {
    label: 'VAT setting changed',
    explain: 'The register priced this with a different VAT registration than your settings now say.',
    severity: 'medium',
  },
  no_tax_profile: {
    label: 'Tax setup missing',
    explain: 'Finish Tax & discounts in Settings so every discount is priced the same way.',
    severity: 'medium',
  },
  self_approved: {
    label: 'Self-approved',
    explain: 'The person who gave the discount also approved it.',
    severity: 'low',
  },
  unusual_id: {
    label: 'Unusual PWD ID',
    explain: 'The PWD ID does not follow the national format.',
    severity: 'low',
  },
  late_sync: {
    label: 'Sent late',
    explain: 'The register sent this record late (it was offline); the time shown is the sale time it reported.',
    severity: 'low',
  },
  recorded_after_cancel: {
    label: 'Arrived after cancel',
    explain: 'The order was already cancelled when this record arrived, so it was recorded and taken back at once.',
    severity: 'low',
  },
  superseded_late: {
    label: 'Older version',
    explain: 'A newer change to this order was recorded first, so this older version was recorded and taken back at once.',
    severity: 'low',
  },
  edited: {
    label: 'Order edited',
    explain: 'The order was changed after the discount was first given.',
    severity: 'low',
  },
}

const SEVERITY_RANK: Record<GovFlagSeverity, number> = { high: 0, medium: 1, low: 2 }

export function isGovFlag(value: unknown): value is GovFlag {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GOV_FLAGS, value)
}

/** Known flags only, most severe first, without repeats. */
export function sortFlags(flags: readonly unknown[]): GovFlag[] {
  return [...new Set(flags.filter(isGovFlag))].sort(
    (a, b) => SEVERITY_RANK[GOV_FLAGS[a].severity] - SEVERITY_RANK[GOV_FLAGS[b].severity],
  )
}

/** Whether the grant deserves a look at all (anything above "low"). */
export function needsReview(flags: readonly unknown[]): boolean {
  return sortFlags(flags).some((flag) => GOV_FLAGS[flag].severity !== 'low')
}
