/**
 * The public loyalty offer — the ONE thing a customer-facing page may say about
 * stamps before it knows who the customer is.
 *
 * Pure: derived from the tenant's flags and its active programs, never from a
 * database. Silent (null) whenever earning is off or in shadow, because a
 * promise the ledger will not keep is worse than no promise.
 */
import type { LoyaltyTenantFlags } from './tenant-flags'
import type { LoyaltyEarnMode, LoyaltyProgram, LoyaltyReward } from './types'

export interface LoyaltyOffer {
  programName: string
  earnMode: LoyaltyEarnMode
  /** Stamps or points needed for one reward. */
  threshold: number
  /** Customer-language reward, e.g. "Free Iced Latte" or "₱100 off". */
  rewardLabel: string
  /** Net spend an order must reach to earn; null when any order earns. */
  minSpend: number | null
}

function formatPeso(amount: number): string {
  const isWhole = Number.isInteger(amount)
  return `₱${isWhole ? amount.toString() : amount.toFixed(2)}`
}

/** A reward as the customer reads it. */
export function describeLoyaltyReward(reward: LoyaltyReward): string {
  switch (reward.type) {
    case 'fixed':
      return `${formatPeso(reward.amount)} off`
    case 'percent':
      return `${reward.percent}% off${reward.maxAmount ? ` (up to ${formatPeso(reward.maxAmount)})` : ''}`
    case 'free_item':
      return `Free ${reward.itemName}`
  }
}

/**
 * Pick the program the page should talk about. A business-wide program is the
 * safest promise (it earns at every branch); a branch program is offered only
 * when it is all the store runs, since the tracking page does not know which
 * branch rang the sale.
 */
function pickOfferProgram(programs: LoyaltyProgram[]): LoyaltyProgram | null {
  const active = programs.filter((p) => p.status === 'active')
  if (active.length === 0) return null
  return active.find((p) => p.scope === 'business') ?? active[0]
}

export function describeLoyaltyOffer(
  flags: LoyaltyTenantFlags,
  programs: LoyaltyProgram[],
): LoyaltyOffer | null {
  if (!flags.isEnabled || flags.isShadow) return null

  const program = pickOfferProgram(programs)
  if (!program) return null

  const { rules } = program.version
  return {
    programName: program.name,
    earnMode: rules.earnMode,
    threshold: rules.threshold,
    rewardLabel: describeLoyaltyReward(rules.reward),
    minSpend: rules.minSpend,
  }
}
