/**
 * Rules validation: the jsonb a version stores is the ONLY thing the engine
 * trusts, so a malformed rules blob must be refused at write time, never
 * discovered mid-earning.
 */
import { parseLoyaltyRules } from '@/lib/loyalty/rules'

const STAMP = {
  earnMode: 'stamp',
  threshold: 10,
  reward: { type: 'free_item', menuItemId: 'item-1', itemName: 'Latte' },
}

const POINTS = {
  earnMode: 'points',
  threshold: 500,
  pointsPerPeso: 1,
  reward: { type: 'percent', percent: 10, maxAmount: 200 },
}

describe('parseLoyaltyRules', () => {
  it('accepts a stamp program with a free-item reward', () => {
    const parsed = parseLoyaltyRules(STAMP)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.isExclusive).toBe(true)
      expect(parsed.value.reward).toEqual(STAMP.reward)
    }
  })

  it('accepts a points program with a capped percent reward', () => {
    const parsed = parseLoyaltyRules(POINTS)
    expect(parsed.ok && parsed.value.pointsPerPeso).toBe(1)
  })

  it.each([
    ['an unknown earn mode', { ...STAMP, earnMode: 'visits' }],
    ['a zero threshold', { ...STAMP, threshold: 0 }],
    ['a points program without a rate', { ...POINTS, pointsPerPeso: undefined }],
    ['a negative min spend', { ...STAMP, minSpend: -1 }],
    ['a percent reward over 100', { ...POINTS, reward: { type: 'percent', percent: 150 } }],
    ['a fixed reward of nothing', { ...STAMP, reward: { type: 'fixed', amount: 0 } }],
    ['a free item without an id', { ...STAMP, reward: { type: 'free_item', itemName: 'Latte' } }],
    ['an unknown reward type', { ...STAMP, reward: { type: 'cashback', amount: 5 } }],
    ['a non-object', 'stamps'],
  ])('refuses %s', (_label, raw) => {
    expect(parseLoyaltyRules(raw).ok).toBe(false)
  })

  it('lets a merchant opt a program into stacking explicitly', () => {
    const parsed = parseLoyaltyRules({ ...STAMP, isExclusive: false })
    expect(parsed.ok && parsed.value.isExclusive).toBe(false)
  })
})
