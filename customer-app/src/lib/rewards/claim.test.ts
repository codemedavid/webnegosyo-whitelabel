import { VALID_LOYALTY } from '@/fixtures/contract-fixtures'
import { appLoyaltySchema } from '@/lib/contract'
import { DEFAULT_CLAIM_LIFETIME_MS, claimCountdown, claimDeadline, claimPhase, isRewardRedeemed } from './claim'

const RECEIVED = Date.parse('2026-11-12T02:00:00Z')
const loyalty = appLoyaltySchema.parse(VALID_LOYALTY)
const REWARD_ID = loyalty.rewards[0].id

describe('claimDeadline', () => {
  it('keeps the store’s expiry when the phone’s clock agrees', () => {
    expect(claimDeadline('2026-11-12T02:02:00Z', RECEIVED)).toBe(RECEIVED + 120_000)
  })

  it('falls back to two minutes when the phone is fast (code looks already expired)', () => {
    expect(claimDeadline('2026-11-12T01:58:00Z', RECEIVED)).toBe(RECEIVED + DEFAULT_CLAIM_LIFETIME_MS)
  })

  it('falls back to two minutes when the phone is far behind', () => {
    expect(claimDeadline('2026-11-12T03:00:00Z', RECEIVED)).toBe(RECEIVED + DEFAULT_CLAIM_LIFETIME_MS)
  })

  it('falls back on an unreadable time', () => {
    expect(claimDeadline('not a time', RECEIVED)).toBe(RECEIVED + DEFAULT_CLAIM_LIFETIME_MS)
  })
})

describe('claimCountdown', () => {
  const deadline = RECEIVED + 120_000

  it('counts down in m:ss, rounding a part second up', () => {
    expect(claimCountdown(deadline, RECEIVED)).toEqual({ secondsLeft: 120, label: '2:00', isExpired: false })
    expect(claimCountdown(deadline, RECEIVED + 500)).toEqual({ secondsLeft: 120, label: '2:00', isExpired: false })
    expect(claimCountdown(deadline, RECEIVED + 115_000)).toEqual({ secondsLeft: 5, label: '0:05', isExpired: false })
  })

  it('is expired at and after the deadline, never negative', () => {
    expect(claimCountdown(deadline, deadline)).toEqual({ secondsLeft: 0, label: '0:00', isExpired: true })
    expect(claimCountdown(deadline, deadline + 60_000).secondsLeft).toBe(0)
  })
})

describe('isRewardRedeemed', () => {
  const issuedAt = RECEIVED

  it('is false while a fresh read still lists the reward', () => {
    expect(isRewardRedeemed(REWARD_ID, loyalty, issuedAt + 5_000, issuedAt)).toBe(false)
  })

  it('is true once a read after the code was issued no longer lists it', () => {
    expect(isRewardRedeemed(REWARD_ID, { rewards: [] }, issuedAt + 5_000, issuedAt)).toBe(true)
  })

  it('ignores a read from before the code was issued', () => {
    expect(isRewardRedeemed(REWARD_ID, { rewards: [] }, issuedAt - 1, issuedAt)).toBe(false)
  })

  it('is false with nothing read yet', () => {
    expect(isRewardRedeemed(REWARD_ID, undefined, issuedAt + 5_000, issuedAt)).toBe(false)
  })
})

describe('claimPhase', () => {
  const base = { isScanned: false, isClaiming: false, hasError: false, deadlineMs: RECEIVED + 120_000, nowMs: RECEIVED }

  it('shows the code until it expires', () => {
    expect(claimPhase(base)).toBe('showing')
    expect(claimPhase({ ...base, nowMs: RECEIVED + 120_000 })).toBe('expired')
  })

  it('is claiming before the first code and while a new one is minted', () => {
    expect(claimPhase({ ...base, deadlineMs: null })).toBe('claiming')
    expect(claimPhase({ ...base, isClaiming: true, nowMs: RECEIVED + 200_000 })).toBe('claiming')
  })

  it('shows a refusal instead of an old code', () => {
    expect(claimPhase({ ...base, hasError: true })).toBe('failed')
  })

  it('lets a scan win over everything, even an expired code', () => {
    expect(claimPhase({ ...base, isScanned: true, hasError: true, nowMs: RECEIVED + 200_000 })).toBe('scanned')
  })
})
