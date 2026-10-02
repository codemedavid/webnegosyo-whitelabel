import { cardSteps, describeNextReward } from '@/lib/loyalty/card-progress'
import type { LoyaltyRewardStep } from '@/lib/loyalty/ladder'

const STEPS: LoyaltyRewardStep[] = [
  { at: 5, label: 'Free Iced Tea', emoji: '🥤', imageUrl: null, isFinal: false },
  { at: 10, label: 'Free Meal', emoji: '🍔', imageUrl: 'https://img/meal.jpg', isFinal: true },
]

describe('cardSteps', () => {
  it('keeps the ladder the server sent, lowest rung first', () => {
    expect(cardSteps([...STEPS].reverse(), 10, 'Free Meal').map((step) => step.at)).toEqual([5, 10])
  })

  it('falls back to one top reward when an older response has no ladder', () => {
    expect(cardSteps(undefined, 8, '₱100 off')).toEqual([
      { at: 8, label: '₱100 off', emoji: '🎁', imageUrl: null, isFinal: true },
    ])
  })

  it('drops rungs that no longer fit the card', () => {
    expect(cardSteps([{ ...STEPS[0], at: 12 }, STEPS[1]], 10, 'Free Meal').map((step) => step.at)).toEqual([10])
  })
})

describe('describeNextReward', () => {
  it.each([
    [0, 'stamp', '5 more stamps → Free Iced Tea', 5],
    [4, 'stamp', '1 more stamp → Free Iced Tea', 1],
    [5, 'stamp', '5 more stamps → Free Meal', 5],
    [9, 'stamp', '1 more stamp → Free Meal', 1],
    [-2, 'stamp', '7 more stamps → Free Iced Tea', 7],
    [120, 'points', '380 more points → Free Meal', 380],
  ] as const)('at %i %s the headline is "%s"', (balance, mode, headline, remaining) => {
    const steps = mode === 'points' ? [{ ...STEPS[0], at: 100 }, { ...STEPS[1], at: 500 }] : STEPS
    const next = describeNextReward(steps, balance, mode)
    expect(next?.headline).toBe(headline)
    expect(next?.remaining).toBe(remaining)
  })

  it('is silent on an empty ladder', () => {
    expect(describeNextReward([], 3, 'stamp')).toBeNull()
  })
})
