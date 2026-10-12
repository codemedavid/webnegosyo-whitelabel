/**
 * Which grants the owner should look at, and how the ledger list narrows.
 *
 * "Needs a look" = a grant still standing (not reversed), carrying at least
 * one high or medium flag (`needsReview`), that nobody has reviewed yet. Low
 * flags (self-approved, order edited, unusual PWD format) stay visible on the
 * row but do not ask for attention.
 */

import {
  GOV_FLAGS,
  needsReview,
  normalizeIdNumber,
  type GovDiscountKind,
  type GovFlag,
  type GovFlagInfo,
} from '@/lib/gov-discount'
import type { GrantEntry, ReviewVerdict } from './types'

export function needsALook(grants: readonly GrantEntry[]): GrantEntry[] {
  return grants
    .filter((grant) => grant.reversedAt === null && grant.reviews.length === 0 && needsReview(grant.flags))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

/** The flags worth a chip, most severe first (already sorted on read). */
export interface FlagChip extends GovFlagInfo {
  flag: GovFlag
}

export function visibleFlags(flags: readonly GovFlag[]): FlagChip[] {
  return flags.map((flag) => ({ flag, ...GOV_FLAGS[flag] }))
}

export function latestVerdict(grant: Pick<GrantEntry, 'reviews'>): ReviewVerdict | null {
  return grant.reviews[0]?.verdict ?? null
}

export interface LedgerFilter {
  kind: GovDiscountKind | 'all'
  cashier: string | 'all'
  flaggedOnly: boolean
  query: string
}

export const EMPTY_LEDGER_FILTER: LedgerFilter = { kind: 'all', cashier: 'all', flaggedOnly: false, query: '' }

const compactId = (value: string): string => normalizeIdNumber(value).replace(/[^A-Z0-9]/g, '')

function matchesQuery(grant: GrantEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  if (grant.claimantName.toLowerCase().includes(needle)) return true
  if ((grant.orderLabel ?? '').toLowerCase().includes(needle)) return true
  const idNeedle = compactId(needle)
  return idNeedle !== '' && compactId(grant.idNumber).includes(idNeedle)
}

export function filterGrants(grants: readonly GrantEntry[], filter: LedgerFilter): GrantEntry[] {
  return grants.filter(
    (grant) =>
      (filter.kind === 'all' || grant.kind === filter.kind) &&
      (filter.cashier === 'all' || grant.grantedByName === filter.cashier) &&
      (!filter.flaggedOnly || grant.flags.length > 0) &&
      matchesQuery(grant, filter.query),
  )
}

/** Cashier names for the filter, alphabetical. */
export function cashierOptions(grants: readonly GrantEntry[]): string[] {
  return [...new Set(grants.map((grant) => grant.grantedByName))].sort((a, b) => a.localeCompare(b))
}
