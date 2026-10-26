import type { AppLoyaltyProgram } from '@/lib/contract'
import { activityTone, formatActivityDate, formatDelta, formatExpiry, howItWorks } from './activity'

// 2026-10-26 10:00 in Manila (UTC+8).
const NOW = new Date('2026-10-26T02:00:00Z')

const program = (overrides: Partial<AppLoyaltyProgram> = {}): AppLoyaltyProgram => ({
  id: 'p',
  name: 'Kape Stamps',
  earnMode: 'stamp',
  threshold: 10,
  balance: 7,
  rewardLabel: 'Free drink',
  minSpend: null,
  branchName: null,
  ...overrides,
})

describe('formatDelta', () => {
  it.each([
    [1, 'stamp', '+1 stamp'],
    [3, 'stamp', '+3 stamps'],
    [-10, 'stamp', '−10 stamps'],
    [50, 'points', '+50 points'],
    [-1, 'points', '−1 point'],
    [0, 'stamp', '0 stamps'],
  ] as const)('%p %s reads %p', (delta, mode, expected) => {
    expect(formatDelta(delta, mode)).toBe(expected)
  })
})

describe('activityTone', () => {
  it('colours earning green, spending neutral and losses red', () => {
    expect(activityTone('earn')).toBe('success')
    expect(activityTone('reward_issued')).toBe('primary')
    expect(activityTone('redeem')).toBe('text')
    expect(activityTone('reverse')).toBe('danger')
    expect(activityTone('reward_expired')).toBe('danger')
    expect(activityTone('correction')).toBe('textMuted')
  })
})

describe('formatActivityDate', () => {
  it.each([
    ['2026-10-26T00:30:00Z', 'Today'],
    ['2026-10-25T15:59:00Z', 'Yesterday'],
    ['2026-10-25T16:01:00Z', 'Today'],
    ['2026-09-29T02:10:00Z', '29 Sep'],
    ['2025-12-31T02:10:00Z', '31 Dec 2025'],
  ])('%p reads %p in Manila time', (iso, expected) => {
    expect(formatActivityDate(iso, NOW)).toBe(expected)
  })
})

describe('formatExpiry', () => {
  it.each([
    ['2026-10-26T15:59:59Z', 'Expires today'],
    ['2026-10-27T15:59:59Z', 'Expires tomorrow'],
    ['2026-10-30T15:59:59Z', 'Expires in 4 days'],
    ['2026-11-30T15:59:59Z', 'Expires 30 Nov'],
    ['2026-10-20T15:59:59Z', 'Expired'],
  ])('%p reads %p', (iso, expected) => {
    expect(formatExpiry(iso, NOW)).toBe(expected)
  })

  it('says nothing for a reward that never expires', () => {
    expect(formatExpiry(null, NOW)).toBeNull()
  })
})

describe('howItWorks', () => {
  it('explains earning, the goal and where it counts', () => {
    expect(howItWorks(program({ minSpend: 100, branchName: 'BGC' }))).toEqual([
      'Earn 1 stamp on every order of ₱100 or more.',
      'Collect 10 stamps to get Free drink.',
      'Stamps land once your order is completed.',
      'Counts at BGC only.',
    ])
  })

  it('drops the minimum and branch lines when they do not apply', () => {
    expect(howItWorks(program({ earnMode: 'points', threshold: 500 }))).toEqual([
      'Earn points on every order.',
      'Collect 500 points to get Free drink.',
      'Points land once your order is completed.',
    ])
  })
})
