/**
 * Does this order earn on this program?
 *
 * Pure and clock-free: the order's own completion time decides activation and
 * end, not "now", so a lifecycle event replayed a week late reaches the same
 * verdict as the one that arrived on time.
 *
 * Whether the order is COMPLETED at all is not decided here — that is
 * `isQualifiedOrderFact`, the one definition the Customer Hub and loyalty
 * share, so a visit that counts on the dashboard is exactly a visit that earns.
 */

import { isQualifiedOrderFact, type CustomerOrderFact } from '@/lib/customer-order-facts'
import type { LoyaltyProgram, LoyaltyQualification, LoyaltyQualificationReason } from './types'

function refuse(reason: LoyaltyQualificationReason): LoyaltyQualification {
  return { isQualified: false, reason }
}

function timeOf(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

export function qualifyOrderForProgram(
  program: LoyaltyProgram,
  fact: CustomerOrderFact,
): LoyaltyQualification {
  if (program.status !== 'active') return refuse('program_not_active')
  // Loyalty is phone-linked: the card belongs to a number the customer can
  // verify by SMS. A profile with only an email cannot claim, so it cannot earn.
  if (!fact.phoneE164) return refuse('anonymous')
  if (!isQualifiedOrderFact(fact) || !fact.completedAt) return refuse('not_completed')

  const completedMs = timeOf(fact.completedAt) ?? 0
  const activatesMs = timeOf(program.activatesAt)
  // No activation instant means the program was never switched on for earning.
  if (activatesMs == null || completedMs < activatesMs) return refuse('before_activation')

  const endsMs = timeOf(program.endsAt)
  if (endsMs != null && completedMs > endsMs) return refuse('after_end')

  // A branch program earns only for visits the ledger can place at that
  // branch. An unrecorded branch is not "probably ours".
  if (program.scope === 'branch' && (!fact.branchId || fact.branchId !== program.outletId)) {
    return refuse('wrong_branch')
  }

  const minSpend = program.version.rules.minSpend
  if (minSpend != null && fact.netTotal < minSpend) return refuse('below_min_spend')

  return { isQualified: true }
}
