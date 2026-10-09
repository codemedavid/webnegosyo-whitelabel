import {
  baseSlugFromName,
  buildOperatingHours,
  buildPaymentMethods,
  isBlockedByDependency,
  isStepSettled,
  matchBestSellers,
  orderTypeToggles,
  slugCandidates,
} from '@/lib/onboarding/plan'

describe('baseSlugFromName', () => {
  test('lowercases, strips accents and punctuation', () => {
    expect(baseSlugFromName("Kape't Tinapay Café!")).toBe('kapet-tinapay-cafe')
  })

  test('never returns a reserved platform route', () => {
    expect(baseSlugFromName('Checkout')).toBe('checkout-store')
    expect(baseSlugFromName('Admin')).toBe('admin-store')
  })

  test('falls back when nothing usable is left', () => {
    expect(baseSlugFromName('☕')).toBe('store')
  })

  test('caps the length without a trailing dash', () => {
    const slug = baseSlugFromName('a'.repeat(39) + ' bcdef')
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('slugCandidates', () => {
  test('numbers the follow-ups from 2', () => {
    expect(slugCandidates('Brew Lab', 3)).toEqual(['brew-lab', 'brew-lab-2', 'brew-lab-3'])
  })
})

describe('buildOperatingHours', () => {
  test('same window every day, listed days closed', () => {
    // Act
    const hours = buildOperatingHours({ open: '09:00', close: '21:00', closedDays: [0], stopOrdersWhenClosed: true })

    // Assert
    expect(Object.keys(hours)).toHaveLength(7)
    expect(hours['0']).toEqual({ closed: true, open: '09:00', close: '21:00' })
    expect(hours['3']).toEqual({ closed: false, open: '09:00', close: '21:00' })
  })
})

describe('buildPaymentMethods', () => {
  test('wallets ask for proof, cash skips details', () => {
    // Act
    const methods = buildPaymentMethods({
      cash: true,
      gcash: { number: '09171234567', accountName: 'Ana Cruz' },
      maya: null,
    })

    // Assert
    expect(methods.map((m) => m.name)).toEqual(['GCash', 'Cash'])
    expect(methods[0]).toMatchObject({ details: 'GCash 09171234567 — Ana Cruz', requirePaymentProof: true })
    expect(methods[1]).toMatchObject({ requirePaymentProof: false, skipPaymentDetails: true })
  })

  test('no cash, no wallets → nothing', () => {
    expect(buildPaymentMethods({ cash: false })).toEqual([])
  })
})

describe('orderTypeToggles', () => {
  test('only chosen types stay on', () => {
    expect(orderTypeToggles(['pickup'])).toEqual({ dine_in: false, pickup: true, delivery: false })
  })
})

describe('matchBestSellers', () => {
  const items = [
    { id: 'a', name: 'Iced Spanish Latte' },
    { id: 'b', name: 'Spanish Latte' },
    { id: 'c', name: 'Chicken Adobo Rice Meal' },
  ]

  test('prefers an exact name over a containing one', () => {
    expect(matchBestSellers(['spanish latte'], items)).toEqual(['b'])
  })

  test('falls back to a containing name and ignores case and accents', () => {
    expect(matchBestSellers(['ADOBO'], items)).toEqual(['c'])
  })

  test('uses each item once and drops names with no match', () => {
    expect(matchBestSellers(['Spanish Latte', 'spanish latte', 'Halo-halo'], items)).toEqual(['b', 'a'])
  })
})

describe('isStepSettled', () => {
  test('done and skipped are settled; failed is retried', () => {
    const steps = { menu: { status: 'done' as const }, boost: { status: 'failed' as const }, loyalty: { status: 'skipped' as const } }
    expect(isStepSettled(steps, 'menu')).toBe(true)
    expect(isStepSettled(steps, 'loyalty')).toBe(true)
    expect(isStepSettled(steps, 'boost')).toBe(false)
    expect(isStepSettled(steps, 'branding')).toBe(false)
  })
})

describe('isBlockedByDependency', () => {
  test('offers and loyalty wait while the menu has failed, so a retry still builds them', () => {
    const steps = { menu: { status: 'failed' as const } }
    expect(isBlockedByDependency(steps, 'design')).toBe(true)
    expect(isBlockedByDependency(steps, 'boost')).toBe(true)
    expect(isBlockedByDependency(steps, 'loyalty')).toBe(true)
    expect(isBlockedByDependency(steps, 'store_setup')).toBe(false)
  })

  test('a done or skipped menu releases them', () => {
    expect(isBlockedByDependency({ menu: { status: 'done' } }, 'boost')).toBe(false)
    expect(isBlockedByDependency({ menu: { status: 'skipped' } }, 'loyalty')).toBe(false)
  })
})

describe('pickLaunchBrandColor — the owner choice beats the logo', () => {
  const { pickLaunchBrandColor } = jest.requireActual('@/lib/onboarding/plan') as typeof import('@/lib/onboarding/plan')

  test('the color the owner picked wins', () => {
    expect(pickLaunchBrandColor('#AA3300', '#112233')).toBe('#aa3300')
  })

  test('falls back to the color read from the logo at upload', () => {
    expect(pickLaunchBrandColor(null, '#112233')).toBe('#112233')
    expect(pickLaunchBrandColor('', '#112233')).toBe('#112233')
  })

  test('null when neither is a usable hex color', () => {
    expect(pickLaunchBrandColor('red', 'javascript:alert(1)')).toBeNull()
    expect(pickLaunchBrandColor(undefined, undefined)).toBeNull()
  })
})
