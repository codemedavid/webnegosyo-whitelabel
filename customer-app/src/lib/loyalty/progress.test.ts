import type { AppLoyaltyProgram } from '@/lib/contract'
import { loyaltyProgress } from './progress'

const program = (overrides: Partial<AppLoyaltyProgram> = {}): AppLoyaltyProgram => ({
  id: 'p',
  name: 'Stamps',
  earnMode: 'stamp',
  threshold: 10,
  balance: 7,
  rewardLabel: 'Free drink',
  minSpend: null,
  branchName: null,
  ...overrides,
})

describe('loyaltyProgress', () => {
  it('describes the stamps still needed', () => {
    expect(loyaltyProgress(program())).toEqual({
      filled: 7,
      total: 10,
      fraction: 0.7,
      remaining: 3,
      caption: '3 more stamps to Free drink',
    })
  })

  it('uses the singular for one', () => {
    expect(loyaltyProgress(program({ balance: 9 })).caption).toBe('1 more stamp to Free drink')
  })

  it('speaks in points for points programs', () => {
    expect(loyaltyProgress(program({ earnMode: 'points', threshold: 500, balance: 120 })).caption).toBe(
      '380 more points to Free drink',
    )
  })

  it('clamps a negative balance (after a reversal) to an empty card', () => {
    expect(loyaltyProgress(program({ balance: -2 }))).toMatchObject({ filled: 0, fraction: 0, remaining: 10 })
  })

  it('celebrates a full card', () => {
    expect(loyaltyProgress(program({ balance: 12 }))).toMatchObject({ filled: 10, fraction: 1, caption: 'Reward unlocked' })
  })
})
