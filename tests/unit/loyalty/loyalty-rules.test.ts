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
    ['a fractional stamp threshold', { ...STAMP, threshold: 1.5 }],
    ['fractional expiry days', { ...STAMP, rewardExpiryDays: 1.5 }],
    ['a sub-centavo fixed reward', { ...STAMP, reward: { type: 'fixed', amount: 0.001 } }],
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

describe('parseLoyaltyRules — reward ladder', () => {
  const DRINK = { type: 'free_item', menuItemId: 'item-2', itemName: 'Iced Tea', emoji: '🥤' }

  it('accepts milestones below the threshold and returns them sorted', () => {
    const parsed = parseLoyaltyRules({
      ...STAMP,
      milestones: [
        { at: 7, reward: { type: 'fixed', amount: 20 } },
        { at: 3, reward: DRINK },
      ],
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.milestones?.map((m) => m.at)).toEqual([3, 7])
      expect(parsed.value.milestones?.[0].reward).toEqual(DRINK)
    }
  })

  it('leaves a program without milestones exactly as before', () => {
    const parsed = parseLoyaltyRules(STAMP)
    expect(parsed.ok && 'milestones' in parsed.value).toBe(false)
  })

  it('keeps a reward emoji and a free item photo', () => {
    const parsed = parseLoyaltyRules({
      ...STAMP,
      reward: { ...STAMP.reward, emoji: '☕', imageUrl: 'https://ik.imagekit.io/x/latte.jpg' },
    })
    expect(parsed.ok && parsed.value.reward).toEqual({
      type: 'free_item', menuItemId: 'item-1', itemName: 'Latte', emoji: '☕', imageUrl: 'https://ik.imagekit.io/x/latte.jpg',
    })
  })

  it.each([
    ['a milestone at the threshold', [{ at: 10, reward: DRINK }]],
    ['a milestone past the threshold', [{ at: 12, reward: DRINK }]],
    ['a milestone at zero', [{ at: 0, reward: DRINK }]],
    ['a fractional stamp milestone', [{ at: 2.5, reward: DRINK }]],
    ['two milestones on one slot', [{ at: 4, reward: DRINK }, { at: 4, reward: DRINK }]],
    ['a milestone with a broken reward', [{ at: 4, reward: { type: 'fixed', amount: 0 } }]],
    ['too many milestones', [1, 2, 3, 4, 5].map((at) => ({ at, reward: DRINK }))],
    ['milestones that are not a list', { at: 4, reward: DRINK }],
  ])('refuses %s', (_label, milestones) => {
    expect(parseLoyaltyRules({ ...STAMP, milestones }).ok).toBe(false)
  })

  it.each([
    ['an over-long emoji', { ...STAMP.reward, emoji: 'x'.repeat(40) }],
    ['a non-https photo', { ...STAMP.reward, imageUrl: 'javascript:alert(1)' }],
  ])('refuses %s', (_label, reward) => {
    expect(parseLoyaltyRules({ ...STAMP, reward }).ok).toBe(false)
  })

  it('accepts fractional-free point milestones on a points card', () => {
    const parsed = parseLoyaltyRules({ ...POINTS, milestones: [{ at: 250, reward: DRINK }] })
    expect(parsed.ok && parsed.value.milestones?.[0].at).toBe(250)
  })
})
