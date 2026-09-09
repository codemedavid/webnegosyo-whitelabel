/**
 * Loyalty types — the shared vocabulary for programs, earning and rewards.
 *
 * Free of Supabase, Convex and React on purpose, exactly like
 * `src/lib/vouchers/types.ts`: the merchant app and the register port these
 * verbatim. Nothing below this line knows what a database is.
 */

/** How a customer earns: one stamp per qualified order, or points per peso. */
export type LoyaltyEarnMode = 'stamp' | 'points'

/** Where a program earns: at every branch, or at one. */
export type LoyaltyProgramScope = 'business' | 'branch'

export type LoyaltyProgramStatus = 'draft' | 'active' | 'paused' | 'ended'

export type LoyaltyReward =
  | { type: 'fixed'; amount: number }
  | { type: 'percent'; percent: number; maxAmount?: number | null }
  /** Waives ONE base unit of the item. Upgrades and add-ons stay payable. */
  | { type: 'free_item'; menuItemId: string; itemName: string }

/** The rules a version stores. Validated by `parseLoyaltyRules`. */
export interface LoyaltyRules {
  earnMode: LoyaltyEarnMode
  /** Stamps or points needed for one reward. */
  threshold: number
  /** Required for `points`; ignored for `stamp`. */
  pointsPerPeso: number | null
  /** Net merchandise subtotal the order must reach to earn at all. */
  minSpend: number | null
  reward: LoyaltyReward
  /** Days an issued reward stays claimable; null = never expires. */
  rewardExpiryDays: number | null
  /** True (default): the reward will not share a sale with a voucher. */
  isExclusive: boolean
}

export interface LoyaltyProgramVersion {
  id: string
  version: number
  rules: LoyaltyRules
  createdAt: string
}

/** A program with its CURRENT version — the one that earns today. */
export interface LoyaltyProgram {
  id: string
  tenantId: string
  name: string
  scope: LoyaltyProgramScope
  outletId: string | null
  status: LoyaltyProgramStatus
  /** Orders completed before this never earn. Null = not yet scheduled. */
  activatesAt: string | null
  endsAt: string | null
  version: LoyaltyProgramVersion
}

/**
 * What an entitlement promises, frozen at issue time so a later rule change
 * cannot alter it.
 */
export interface LoyaltyEntitlementTerms {
  programId: string
  programName: string
  versionNumber: number
  reward: LoyaltyReward
  isExclusive: boolean
}

export type LoyaltyQualificationReason =
  | 'program_not_active'
  | 'before_activation'
  | 'after_end'
  | 'wrong_branch'
  | 'anonymous'
  | 'not_completed'
  | 'below_min_spend'

export type LoyaltyQualification =
  | { isQualified: true }
  | { isQualified: false; reason: LoyaltyQualificationReason }

/** One program's share of an order's earning, ready for `apply_loyalty_earning`. */
export interface LoyaltyEarnPlan {
  programId: string
  versionId: string
  delta: number
  threshold: number
  rewardTerms: LoyaltyEntitlementTerms
  rewardExpiresAt: string | null
}
