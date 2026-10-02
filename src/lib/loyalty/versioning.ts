/**
 * Versions are immutable; edits are new rows; issued rewards keep their terms.
 * The database enforces the first two (a trigger refuses UPDATE/DELETE on
 * versions). This module owns the third: the snapshot an entitlement carries.
 */

import type { LoyaltyEntitlementTerms, LoyaltyMilestonePlan, LoyaltyRules } from './types'

export function nextProgramVersion(latest: number | null): number {
  return (latest ?? 0) + 1
}

export interface RewardTermsSource {
  id: string
  name: string
  versionNumber: number
  rules: LoyaltyRules
}

/** A deep copy of the reward, so a later rule edit cannot reach it. */
export function snapshotRewardTerms(source: RewardTermsSource): LoyaltyEntitlementTerms {
  return {
    programId: source.id,
    programName: source.name,
    versionNumber: source.versionNumber,
    reward: { ...source.rules.reward },
    isExclusive: source.rules.isExclusive,
  }
}

/**
 * One frozen snapshot per mid-card rung. Each carries `milestoneAt` so the
 * database knows the rung it fills and never issues the same one twice on a card.
 */
export function snapshotMilestoneTerms(source: RewardTermsSource): LoyaltyMilestonePlan[] {
  return (source.rules.milestones ?? []).map((milestone) => ({
    at: milestone.at,
    terms: {
      programId: source.id,
      programName: source.name,
      versionNumber: source.versionNumber,
      reward: { ...milestone.reward },
      isExclusive: source.rules.isExclusive,
      milestoneAt: milestone.at,
    },
  }))
}

/** The `p_milestones` jsonb `apply_loyalty_earning` reads: `[{ at, terms }]`. */
export function toMilestoneArg(
  milestones: readonly LoyaltyMilestonePlan[],
): { at: number; terms: LoyaltyEntitlementTerms }[] {
  return milestones.map((milestone) => ({ at: milestone.at, terms: milestone.terms }))
}
