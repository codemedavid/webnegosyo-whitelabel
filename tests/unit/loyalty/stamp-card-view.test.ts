import { decideStampCardView, type StampCardViewInput } from '@/lib/loyalty/stamp-card-view'
import { summarizeStampCard } from '@/lib/loyalty/stamp-status'
import type { LoyaltyProgram } from '@/lib/loyalty/types'

const base: StampCardViewInput = {
  hasOffer: true,
  hasContact: false,
  isClaimOpen: true,
  hasCard: false,
  isCancelled: false,
}

describe('decideStampCardView', () => {
  test('offers the claim form on an unclaimed order while the window is open', () => {
    expect(decideStampCardView(base)).toBe('claim')
  })

  test('shows the card once the order has earned, even after the window closed', () => {
    expect(decideStampCardView({ ...base, hasCard: true, isClaimOpen: false, hasContact: true }))
      .toBe('card')
  })

  test('keeps showing the card to a customer who just claimed', () => {
    // The old page hid the whole card the moment `hasContact` flipped true on
    // the next poll, so the stamps disappeared a few seconds after landing.
    expect(decideStampCardView({ ...base, hasContact: true, hasCard: true })).toBe('card')
  })

  test('says the stamp is coming while a claimed order is still in flight', () => {
    expect(decideStampCardView({ ...base, hasContact: true })).toBe('awaiting')
  })

  test('promises nothing once a completed order produced no stamp', () => {
    expect(decideStampCardView({ ...base, hasContact: true, isClaimOpen: false })).toBe('hidden')
  })

  test('tells an unclaimed, finished order that claiming is closed', () => {
    expect(decideStampCardView({ ...base, isClaimOpen: false })).toBe('closed')
  })

  test('falls back to plain contact capture when the store has no offer', () => {
    expect(decideStampCardView({ ...base, hasOffer: false })).toBe('contact_only')
    expect(decideStampCardView({ ...base, hasOffer: false, hasContact: true })).toBe('hidden')
    expect(decideStampCardView({ ...base, hasOffer: false, isClaimOpen: false })).toBe('hidden')
  })

  test('a cancelled order shows nothing at all', () => {
    expect(decideStampCardView({ ...base, isCancelled: true, hasCard: true })).toBe('hidden')
  })
})

function program(overrides: Partial<LoyaltyProgram> = {}): LoyaltyProgram {
  return {
    id: 'prog-1',
    tenantId: 'tenant-1',
    name: 'Loyalty Card',
    scope: 'business',
    outletId: null,
    status: 'active',
    activatesAt: null,
    endsAt: null,
    version: {
      id: 'ver-1',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      rules: {
        earnMode: 'stamp',
        threshold: 8,
        minSpend: null,
        reward: { type: 'fixed', amount: 100 },
      },
    },
    ...overrides,
  } as LoyaltyProgram
}

describe('summarizeStampCard', () => {
  test('builds the card from the program that actually earned', () => {
    const card = summarizeStampCard({
      programs: [program({ id: 'other' }), program()],
      earnedProgramId: 'prog-1',
      balance: 3,
      rewardsAvailable: 1,
    })
    expect(card).toEqual({
      programName: 'Loyalty Card',
      earnMode: 'stamp',
      balance: 3,
      threshold: 8,
      rewardsAvailable: 1,
      rewardLabel: '₱100 off',
    })
  })

  test('is silent when the order never earned', () => {
    expect(summarizeStampCard({ programs: [program()], earnedProgramId: null, balance: 5, rewardsAvailable: 0 }))
      .toBeNull()
  })

  test('is silent when the earning program is no longer active', () => {
    expect(summarizeStampCard({ programs: [], earnedProgramId: 'prog-1', balance: 5, rewardsAvailable: 0 }))
      .toBeNull()
  })

  test('an unknown or negative balance reads as zero, never as a negative stamp count', () => {
    expect(summarizeStampCard({ programs: [program()], earnedProgramId: 'prog-1', balance: null, rewardsAvailable: 0 })?.balance).toBe(0)
    expect(summarizeStampCard({ programs: [program()], earnedProgramId: 'prog-1', balance: -2, rewardsAvailable: -3 }))
      .toMatchObject({ balance: 0, rewardsAvailable: 0 })
  })
})
