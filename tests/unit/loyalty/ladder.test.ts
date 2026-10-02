import { nextRewardStep, rewardSteps } from '@/lib/loyalty/ladder'
import type { LoyaltyRules } from '@/lib/loyalty/types'

const RULES: LoyaltyRules = {
  earnMode: 'stamp',
  threshold: 10,
  pointsPerPeso: null,
  minSpend: null,
  rewardExpiryDays: null,
  isExclusive: true,
  reward: { type: 'free_item', menuItemId: 'meal', itemName: 'Chicken Meal', imageUrl: 'https://img/meal.jpg' },
  milestones: [{ at: 5, reward: { type: 'free_item', menuItemId: 'tea', itemName: 'Iced Tea', emoji: '🥤' } }],
}

describe('rewardSteps', () => {
  it('lists every rung, the card reset last', () => {
    expect(rewardSteps(RULES)).toEqual([
      { at: 5, label: 'Free Iced Tea', emoji: '🥤', imageUrl: null, isFinal: false },
      { at: 10, label: 'Free Chicken Meal', emoji: '🎁', imageUrl: 'https://img/meal.jpg', isFinal: true },
    ])
  })

  it('gives a single-reward card one rung with a type emoji', () => {
    const steps = rewardSteps({ ...RULES, milestones: undefined, reward: { type: 'fixed', amount: 50 } })
    expect(steps).toEqual([{ at: 10, label: '₱50 off', emoji: '💸', imageUrl: null, isFinal: true }])
  })
})

describe('nextRewardStep', () => {
  it.each([
    [0, 'Free Iced Tea', 5],
    [4, 'Free Iced Tea', 1],
    [5, 'Free Chicken Meal', 5],
    [9, 'Free Chicken Meal', 1],
    [-2, 'Free Iced Tea', 7],
  ])('at %i stamps the next reward is %s, %i away', (balance, label, remaining) => {
    const next = nextRewardStep(RULES, balance)
    expect(next?.step.label).toBe(label)
    expect(next?.remaining).toBe(remaining)
  })
})
