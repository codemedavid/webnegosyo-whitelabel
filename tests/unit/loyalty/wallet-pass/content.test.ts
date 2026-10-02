import {
  buildWalletPassContent,
  hashWalletPassContent,
  type WalletPassContentInput,
} from '@/lib/loyalty/wallet-pass/content'
import type { LoyaltyProgram } from '@/lib/loyalty/types'

const NOW = Date.parse('2026-09-29T00:00:00Z')

function program(overrides: Partial<LoyaltyProgram> = {}, rules: Partial<LoyaltyProgram['version']['rules']> = {}): LoyaltyProgram {
  return {
    id: 'program-1',
    tenantId: 'tenant-1',
    name: 'Coffee Club',
    scope: 'business',
    outletId: null,
    status: 'active',
    activatesAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    version: {
      id: 'version-1',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      rules: {
        earnMode: 'stamp',
        threshold: 10,
        pointsPerPeso: null,
        minSpend: null,
        reward: { type: 'free_item', menuItemId: 'item-1', itemName: 'Iced Latte' },
        rewardExpiryDays: 30,
        isExclusive: true,
        ...rules,
      },
    },
    ...overrides,
  } as LoyaltyProgram
}

function input(overrides: Partial<WalletPassContentInput> = {}): WalletPassContentInput {
  return {
    serial: 'A'.repeat(24),
    storeName: 'Kape Co.',
    logoUrl: 'https://img.example.com/logo.png',
    storeUrl: 'https://kape.webnegosyo.com/menu',
    colors: { background: '#1F6F43', text: '#FFFFFF' },
    program: program(),
    balance: 7,
    rewardExpiries: [],
    nowMs: NOW,
    ...overrides,
  }
}

describe('buildWalletPassContent', () => {
  test('describes stamp progress in the customer’s words', () => {
    const content = buildWalletPassContent(input())
    expect(content.balanceText).toBe('7 / 10')
    expect(content.balanceLabel).toBe('STAMPS')
    expect(content.remainingText).toBe('3 more stamps')
    expect(content.rewardLabel).toBe('Free Iced Latte')
    expect(content.headline).toEqual({ label: 'NEXT REWARD', value: 'Free Iced Latte' })
  })

  test('uses the singular for one stamp to go', () => {
    expect(buildWalletPassContent(input({ balance: 9 })).remainingText).toBe('1 more stamp')
  })

  test('an unknown balance reads as a fresh card, not a crash', () => {
    const content = buildWalletPassContent(input({ balance: null }))
    expect(content.balanceText).toBe('0 / 10')
    expect(content.remainingText).toBe('10 more stamps')
  })

  test('points programmes speak in points', () => {
    const content = buildWalletPassContent(input({
      program: program({}, { earnMode: 'points', threshold: 500, pointsPerPeso: 1 }),
      balance: 125.5,
    }))
    expect(content.balanceLabel).toBe('POINTS')
    expect(content.balanceText).toBe('125.5 / 500')
    expect(content.remainingText).toBe('374.5 more points')
  })

  test('a waiting reward takes over the headline', () => {
    const content = buildWalletPassContent(input({
      rewardExpiries: ['2026-10-20T00:00:00Z', '2026-10-05T00:00:00Z', null],
    }))
    expect(content.rewardsAvailable).toBe(3)
    expect(content.headline).toEqual({ label: 'REWARDS READY', value: '3 × Free Iced Latte' })
    expect(content.nextRewardExpiresAt).toBe('2026-10-05T00:00:00.000Z')
  })

  test('expired rewards are not counted even if the caller passed them', () => {
    const content = buildWalletPassContent(input({ rewardExpiries: ['2026-09-01T00:00:00Z'] }))
    expect(content.rewardsAvailable).toBe(0)
    expect(content.nextRewardExpiresAt).toBeNull()
  })

  test('an ended programme says so instead of promising more stamps', () => {
    const content = buildWalletPassContent(input({ program: program({ status: 'ended' }) }))
    expect(content.programStatus).toBe('ended')
    expect(content.statusNote).toMatch(/no longer collecting/i)
  })

  test('a programme past its end date counts as ended', () => {
    const content = buildWalletPassContent(input({ program: program({ endsAt: '2026-09-01T00:00:00Z' }) }))
    expect(content.programStatus).toBe('ended')
  })

  test('keeps a readable text colour when the brand pair has poor contrast', () => {
    const content = buildWalletPassContent(input({ colors: { background: '#FFEE00', text: '#FFFFFF' } }))
    expect(content.colors.background).toBe('#FFEE00')
    expect(content.colors.foreground).toBe('#111111')
  })

  test('falls back to a neutral card for unusable colours', () => {
    const content = buildWalletPassContent(input({ colors: { background: 'url(javascript:x)', text: '' } }))
    expect(content.colors.background).toMatch(/^#[0-9A-F]{6}$/)
    expect(content.colors.foreground).toMatch(/^#[0-9A-F]{6}$/)
  })

  test('drops logos that are not https', () => {
    expect(buildWalletPassContent(input({ logoUrl: 'http://insecure/logo.png' })).logoUrl).toBeNull()
    expect(buildWalletPassContent(input({ logoUrl: 'javascript:alert(1)' })).logoUrl).toBeNull()
  })

  test('a stamp programme carries the stamp grid the pass strip draws', () => {
    const content = buildWalletPassContent(input())
    expect(content.stampCard).toEqual({ filled: 7, total: 10, rewardSlots: [10] })
    expect(content.offerText).toBe('Collect 10 stamps, get Free Iced Latte')
  })

  test('milestone rewards are marked on their own slots', () => {
    const content = buildWalletPassContent(input({
      program: program({}, { milestones: [{ at: 5, reward: { type: 'fixed', amount: 50 } }] }),
    }))
    expect(content.stampCard?.rewardSlots).toEqual([5, 10])
  })

  test('a stamp grid never shows more stamps than the card holds', () => {
    expect(buildWalletPassContent(input({ balance: 14 })).stampCard?.filled).toBe(10)
    expect(buildWalletPassContent(input({ balance: -2 })).stampCard?.filled).toBe(0)
  })

  test('points programmes and very long stamp cards get no stamp grid', () => {
    const points = buildWalletPassContent(input({
      program: program({}, { earnMode: 'points', threshold: 500, pointsPerPeso: 1 }),
    }))
    expect(points.stampCard).toBeNull()
    expect(points.offerText).toBe('Collect 500 points, get Free Iced Latte')
    expect(buildWalletPassContent(input({ program: program({}, { threshold: 20 }) })).stampCard).toBeNull()
  })

  test('carries the member code, never a phone number', () => {
    const content = buildWalletPassContent(input())
    expect(content.memberCode).toBe(`WNLC1.${'A'.repeat(24)}`)
    expect(JSON.stringify(content)).not.toMatch(/\+639/)
  })
})

describe('hashWalletPassContent', () => {
  test('is stable for identical content', () => {
    expect(hashWalletPassContent(buildWalletPassContent(input())))
      .toBe(hashWalletPassContent(buildWalletPassContent(input())))
  })

  test('changes when the balance moves', () => {
    expect(hashWalletPassContent(buildWalletPassContent(input({ balance: 7 }))))
      .not.toBe(hashWalletPassContent(buildWalletPassContent(input({ balance: 8 }))))
  })
})

describe('buildWalletPassContent — reward ladder', () => {
  const ladder = program({}, { milestones: [{ at: 5, reward: { type: 'free_item', menuItemId: 'tea', itemName: 'Iced Tea', emoji: '🥤' } }] })

  test('points the card at the next rung, not the top reward', () => {
    const content = buildWalletPassContent(input({ program: ladder, balance: 3 }))
    expect(content.headline).toEqual({ label: 'NEXT REWARD', value: 'Free Iced Tea' })
    expect(content.remainingText).toBe('2 more stamps')
  })

  test('moves on to the top reward once the middle rung is passed', () => {
    const content = buildWalletPassContent(input({ program: ladder, balance: 7 }))
    expect(content.headline.value).toBe('Free Iced Latte')
    expect(content.remainingText).toBe('3 more stamps')
  })

  test('counts ready rewards rather than naming one', () => {
    const content = buildWalletPassContent(input({ program: ladder, balance: 2, rewardExpiries: [null, null] }))
    expect(content.headline).toEqual({ label: 'REWARDS READY', value: '2 rewards' })
  })
})
