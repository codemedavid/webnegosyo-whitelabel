/**
 * What one order's receipt may say about the customer's stamp card.
 *
 * Pure. The tracking page reads this on every load, so a customer who claimed
 * yesterday and comes back to the page still sees the card — the claim reply
 * is not the only place a stamp is ever shown.
 *
 * The card is built from the program that ACTUALLY earned on this order, not
 * from the store's headline offer: a customer whose stamp landed on a branch
 * programme must see that programme's threshold, not another one's.
 */

import { describeLoyaltyReward } from './offer'
import type { LoyaltyEarnMode, LoyaltyProgram } from './types'

export interface OrderStampCard {
  /** False when showing existing progress before this order earns. */
  earnedOnOrder?: boolean
  programName: string
  earnMode: LoyaltyEarnMode
  /** Stamps/points toward the next reward. */
  balance: number
  /** Stamps/points one reward costs. */
  threshold: number
  /** Rewards the customer holds and has not used yet. */
  rewardsAvailable: number
  rewardLabel: string
}

export interface StampCardInput {
  /** The programs that earn today, from `loadActiveLoyaltyPrograms`. */
  programs: LoyaltyProgram[]
  /** The program this order's earn row was written against, if any. */
  earnedProgramId: string | null
  /** The customer's live balance for that program, or null when unknown. */
  balance: number | null
  rewardsAvailable: number
}

function clampCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function summarizeStampCard(input: StampCardInput): OrderStampCard | null {
  if (!input.earnedProgramId) return null

  const program = input.programs.find((p) => p.id === input.earnedProgramId)
  // A program that has since ended still holds the customer's stamps, but the
  // page has no rules to read; saying nothing beats inventing a threshold.
  if (!program) return null

  const { rules } = program.version
  const balance = Number(input.balance)

  return {
    programName: program.name,
    earnMode: rules.earnMode,
    balance: Number.isFinite(balance) && balance > 0 ? balance : 0,
    threshold: rules.threshold,
    rewardsAvailable: clampCount(input.rewardsAvailable),
    rewardLabel: describeLoyaltyReward(rules.reward),
  }
}
