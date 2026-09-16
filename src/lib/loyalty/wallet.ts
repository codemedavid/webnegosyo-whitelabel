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
  }[]
  rewards: {
    id: string
    programName: string
    label: string
    expiresAt: string | null
    branchName: string | null
    freeItem: boolean
  }[]
  claimsAvailable: boolean
}
