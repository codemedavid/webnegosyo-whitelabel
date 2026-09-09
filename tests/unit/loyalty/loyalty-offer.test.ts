/**
 * The public loyalty offer: what the customer-facing tracking page may PROMISE
 * about stamps before a phone number is attached.
 *
 * The offer is derived from the merchant's live programs and must stay silent
 * whenever earning is off or still in shadow — a page promising a stamp that
 * the ledger will never issue is worse than no promise at all.
 */
import { describeLoyaltyOffer, describeLoyaltyReward } from '@/lib/loyalty/offer'
import type { LoyaltyProgram, LoyaltyReward } from '@/lib/loyalty/types'

const LIVE = { isEnabled: true, isShadow: false }

function program(id: string, overrides: Partial<LoyaltyProgram> = {}): LoyaltyProgram {
  return {
    id,
    tenantId: 'tenant-1',
    name: `Program ${id}`,
    scope: 'business',
    outletId: null,
    status: 'active',
    activatesAt: '2026-09-01T00:00:00.000Z',
    endsAt: null,
    version: {
      id: `ver-${id}`,
      version: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      rules: {
        earnMode: 'stamp',
        threshold: 8,
        pointsPerPeso: null,
        minSpend: null,
        reward: { type: 'free_item', menuItemId: 'item-1', itemName: 'Iced Latte' },
        rewardExpiryDays: null,
        isExclusive: true,
      },
    },
    ...overrides,
  }
}

describe('describeLoyaltyReward', () => {
  it('labels each reward type in customer language', () => {
    const cases: Array<[LoyaltyReward, string]> = [
      [{ type: 'fixed', amount: 100 }, '₱100 off'],
      [{ type: 'fixed', amount: 49.5 }, '₱49.50 off'],
      [{ type: 'percent', percent: 20 }, '20% off'],
      [{ type: 'free_item', menuItemId: 'x', itemName: 'Iced Latte' }, 'Free Iced Latte'],
    ]
    for (const [reward, label] of cases) {
      expect(describeLoyaltyReward(reward)).toBe(label)
    }
  })
})

describe('describeLoyaltyOffer', () => {
  it('is silent when loyalty is disabled', () => {
    expect(describeLoyaltyOffer({ isEnabled: false, isShadow: false }, [program('a')])).toBeNull()
  })

  it('is silent while the store is still in shadow', () => {
    expect(describeLoyaltyOffer({ isEnabled: true, isShadow: true }, [program('a')])).toBeNull()
  })

  it('is silent when there is no active program', () => {
    expect(describeLoyaltyOffer(LIVE, [])).toBeNull()
    expect(describeLoyaltyOffer(LIVE, [program('a', { status: 'paused' })])).toBeNull()
  })

  it('describes a stamp program as stamps toward a reward', () => {
    expect(describeLoyaltyOffer(LIVE, [program('a')])).toEqual({
      programName: 'Program a',
      earnMode: 'stamp',
      threshold: 8,
      rewardLabel: 'Free Iced Latte',
      minSpend: null,
    })
  })

  it('describes a points program with its threshold and minimum spend', () => {
    const points = program('p', {
      version: {
        ...program('p').version,
        rules: {
          earnMode: 'points',
          threshold: 500,
          pointsPerPeso: 1,
          minSpend: 150,
          reward: { type: 'percent', percent: 10 },
          rewardExpiryDays: 30,
          isExclusive: true,
        },
      },
    })
    expect(describeLoyaltyOffer(LIVE, [points])).toMatchObject({
      earnMode: 'points',
      threshold: 500,
      rewardLabel: '10% off',
      minSpend: 150,
    })
  })

  it('prefers a business-wide program over a branch-only one', () => {
    const branch = program('b', { scope: 'branch', outletId: 'outlet-1', name: 'Branch only' })
    const business = program('a', { name: 'Everywhere' })
    expect(describeLoyaltyOffer(LIVE, [branch, business])?.programName).toBe('Everywhere')
  })

  it('falls back to a branch program when that is all the store runs', () => {
    const branch = program('b', { scope: 'branch', outletId: 'outlet-1', name: 'Branch only' })
    expect(describeLoyaltyOffer(LIVE, [branch])?.programName).toBe('Branch only')
  })
})
