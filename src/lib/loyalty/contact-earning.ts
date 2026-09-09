/**
 * The customer-facing summary of what attaching a phone number did for the
 * order's loyalty stamp.
 *
 * Pure. Turns the lifecycle result into four honest states the stamp card can
 * animate, and drops everything the customer must not see (program ids, the
 * shadow flag, ledger reasons).
 */
import type { LoyaltyLifecycleResult } from './lifecycle'

export type ContactEarningSummary =
  /** The number is on the order; nothing about stamps is promised. */
  | { state: 'attached' }
  /** The number is on the order; the order has not qualified (yet). */
  | { state: 'pending' }
  /** The order earned. `balance` is stamps toward the next reward, or null when unknown. */
  | { state: 'earned'; stamps: number; balance: number | null; rewardUnlocked: boolean }

const ATTACHED: ContactEarningSummary = { state: 'attached' }

export function summarizeContactEarning(
  result: LoyaltyLifecycleResult | null,
): ContactEarningSummary {
  if (!result || !result.ran) return ATTACHED
  // A shadow store records what the customer WOULD earn and issues nothing.
  // Showing a stamp here would be a lie the merchant cannot honour at the counter.
  if (result.isShadow) return ATTACHED

  const { outcome } = result
  if (outcome.action === 'skipped') {
    return outcome.reason === 'not_qualified' ? { state: 'pending' } : ATTACHED
  }
  if (outcome.action !== 'earned') return ATTACHED

  // Programs that actually moved the ledger, plus replays it refused because
  // the stamp is already there — both mean the customer holds the stamp.
  const counted = outcome.programs.filter((p) => p.applied || p.isDuplicate)
  if (counted.length === 0) return ATTACHED

  const primary = counted.find((p) => p.applied) ?? counted[0]
  return {
    state: 'earned',
    stamps: primary.delta,
    balance: typeof primary.balance === 'number' ? primary.balance : null,
    rewardUnlocked: counted.some((p) => p.entitlementsIssued > 0),
  }
}
