import type { LoyaltyRewardStep } from './ladder'
import type { LoyaltyEarnMode } from './types'
export interface LoyaltyWallet {
  programs: {
    id: string
    name: string
    status: string
    branchName: string | null
    earnMode: LoyaltyEarnMode
    threshold: number
    balance: number
    rewardLabel: string
    minSpend: number | null
    /** Every reward on the card, lowest rung first. */
    rewardSteps?: LoyaltyRewardStep[]
  }[]
  rewards: {
    id: string
    programName: string
    label: string
    expiresAt: string | null
    branchName: string | null
    freeItem: boolean
    /** The reward's icon, always set by the route. */
    emoji?: string
    /** The menu photo of a free item, when the catalog had one. */
    imageUrl?: string | null
  }[]
  claimsAvailable: boolean
}
