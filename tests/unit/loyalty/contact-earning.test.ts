/**
 * What the receipt-QR contact capture tells the customer about their stamp.
 *
 * A counter sale is usually already settled when the customer scans the
 * receipt, so attaching a phone is the FIRST moment the order can earn. The
 * API runs earning right after the write and hands the page a small, honest
 * summary — never the raw ledger outcome.
 */
import { summarizeContactEarning } from '@/lib/loyalty/contact-earning'
import type { LoyaltyLifecycleResult } from '@/lib/loyalty/lifecycle'

function earned(overrides: Partial<{ applied: boolean; isDuplicate: boolean; entitlementsIssued: number; balance?: number }> = {}): LoyaltyLifecycleResult {
  return {
    ran: true,
    isShadow: false,
    outcome: {
      action: 'earned',
      programs: [
        {
          programId: 'prog-1',
          kind: 'earn',
          delta: 1,
          applied: true,
          isDuplicate: false,
          entitlementsIssued: 0,
          balance: 3,
          ...overrides,
        },
      ],
    },
  }
}

describe('summarizeContactEarning', () => {
  it('reports a plain attach when loyalty did not run', () => {
    expect(summarizeContactEarning(null)).toEqual({ state: 'attached' })
    expect(summarizeContactEarning({ ran: false, reason: 'disabled' })).toEqual({ state: 'attached' })
    expect(summarizeContactEarning({ ran: false, reason: 'order_not_found' })).toEqual({ state: 'attached' })
  })

  it('reports the stamp and the new balance when the order earned', () => {
    expect(summarizeContactEarning(earned())).toEqual({
      state: 'earned',
      stamps: 1,
      balance: 3,
      rewardUnlocked: false,
    })
  })

  it('flags a reward when earning crossed the threshold', () => {
    expect(summarizeContactEarning(earned({ entitlementsIssued: 1, balance: 0 }))).toMatchObject({
      state: 'earned',
      rewardUnlocked: true,
      balance: 0,
    })
  })

  it('treats a replay the ledger refused as already earned, with no balance claim', () => {
    const result = summarizeContactEarning(earned({ applied: false, isDuplicate: true, balance: undefined }))
    expect(result).toEqual({ state: 'earned', stamps: 1, balance: null, rewardUnlocked: false })
  })

  it('never shows a stamp for a shadow store', () => {
    const shadow = earned()
    if (!shadow.ran) throw new Error('fixture must have run')
    expect(summarizeContactEarning({ ...shadow, isShadow: true })).toEqual({ state: 'attached' })
  })

  it('reports pending when the order has not qualified yet', () => {
    const skipped: LoyaltyLifecycleResult = {
      ran: true,
      isShadow: false,
      outcome: { action: 'skipped', reason: 'not_qualified', programs: [] },
    }
    expect(summarizeContactEarning(skipped)).toEqual({ state: 'pending' })
  })

  it('reports a plain attach when the store runs no program', () => {
    const skipped: LoyaltyLifecycleResult = {
      ran: true,
      isShadow: false,
      outcome: { action: 'skipped', reason: 'no_programs', programs: [] },
    }
    expect(summarizeContactEarning(skipped)).toEqual({ state: 'attached' })
  })

  it('reports a plain attach when earning applied to no program at all', () => {
    const nothing = earned({ applied: false, isDuplicate: false })
    expect(summarizeContactEarning(nothing)).toEqual({ state: 'attached' })
  })
})
