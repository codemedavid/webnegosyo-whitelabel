/**
 * Versioning: a live rule change is a NEW version, and an issued reward keeps
 * the terms it was issued under.
 */
import { nextProgramVersion, snapshotRewardTerms } from '@/lib/loyalty/versioning'
import type { LoyaltyRules } from '@/lib/loyalty/types'

const RULES: LoyaltyRules = {
  earnMode: 'stamp',
  threshold: 10,
  minSpend: null,
  pointsPerPeso: null,
  reward: { type: 'fixed', amount: 50 },
  rewardExpiryDays: null,
  isExclusive: true,
}

describe('nextProgramVersion', () => {
  it('numbers the first version 1 and each edit one higher', () => {
    expect(nextProgramVersion(null)).toBe(1)
    expect(nextProgramVersion(4)).toBe(5)
  })
})

describe('snapshotRewardTerms', () => {
  it('copies the reward so a later edit cannot change what was promised', () => {
    const terms = snapshotRewardTerms({ id: 'p', name: 'Card', versionNumber: 2, rules: RULES })
    const edited = { ...RULES, reward: { type: 'fixed' as const, amount: 5 } }
    expect(terms.reward).toEqual({ type: 'fixed', amount: 50 })
    expect(edited.reward.amount).toBe(5)
    expect(terms).toEqual({
      programId: 'p',
      programName: 'Card',
      versionNumber: 2,
      reward: { type: 'fixed', amount: 50 },
      isExclusive: true,
    })
  })
})
