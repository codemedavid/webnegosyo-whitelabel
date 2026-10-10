import { describe, it, expect } from '@jest/globals'
import { COPY_LIMITS, cleanLaunchCopy, fallbackLaunchCopy, honestLine } from '@/lib/onboarding/launch-copy'
import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'

const FALLBACK = fallbackLaunchCopy({ storeName: 'Karamotan Grill', storeType: 'restaurant' })

const GOOD_AI = {
  kicker: 'Grilled to order',
  headline: 'Smoky liempo and pusit, straight off the grill',
  body: 'Grilled pork, squid and chicken with chao fan rice, made for sharing.',
  highlights: ['Grilled liempo and pusit', 'Chao fan rice platters', 'Pasta and seafood too'],
  primaryCta: 'Order now',
}

describe('honestLine', () => {
  it.each([
    'Rated 4.9 by our regulars',
    'Since 2012',
    'Est. 2019 · Maginhawa',
    'Ready in 30 minutes',
    'Free delivery over ₱500',
    'Award-winning sisig',
    'The best grill in town',
    'Loved by 12,000+ neighbors',
    'Famous for our lechon',
    '100% organic greens',
    'Follow us @karamotan',
    'Visit www.example.com',
    'Order at scam-site.com',
    'Ready in half an hour',
    'Rated ４.９ by regulars',
    'Twenty kinds of sisig',
    'Buy one, get one',
    'We deliver citywide',
    'Pay with GCash',
    'Authentic homemade adobo',
    'Charcoal-grilled liempo',
    'Locally sourced seafood',
  ])('refuses a claim we cannot know: %s', (line) => {
    expect(honestLine(line, 200)).toBeNull()
  })

  it.each(['Grilled to order', 'Smoky liempo, straight off the grill', 'Sarap ng ihaw, every day'])('keeps an honest line: %s', (line) => {
    expect(honestLine(line, 200)).toBe(line)
  })

  it('strips markup and squeezes spaces, then measures', () => {
    expect(honestLine('  **Big**   [flavor]  ', 200)).toBe('Big (flavor)')
    expect(honestLine("Mama_Lou's", 200)).toBe("Mama_Lou's")
    expect(honestLine('a'.repeat(COPY_LIMITS.kicker + 1), COPY_LIMITS.kicker)).toBeNull()
    expect(honestLine(42, 200)).toBeNull()
  })
})

describe('fallbackLaunchCopy', () => {
  it.each(Object.keys(STORE_TYPES) as StoreType[])('%s copy is honest and within every limit', (storeType) => {
    const copy = fallbackLaunchCopy({ storeName: 'Juan', storeType })
    expect(honestLine(copy.kicker, COPY_LIMITS.kicker)).not.toBeNull()
    expect(honestLine(copy.body, COPY_LIMITS.body)).not.toBeNull()
    for (const line of copy.highlights) expect(honestLine(line, COPY_LIMITS.highlight)).not.toBeNull()
    expect(copy.headline).toBe('Juan')
  })

  it("uses the owner's tagline as the body only when it is honest", () => {
    expect(fallbackLaunchCopy({ storeName: 'Juan', storeType: 'restaurant', tagline: 'Silog all day' }).body).toBe('Silog all day')
    expect(fallbackLaunchCopy({ storeName: 'Juan', storeType: 'restaurant', tagline: 'Since 1998' }).body).not.toContain('1998')
  })
})

describe('cleanLaunchCopy', () => {
  it('keeps every AI line that passes', () => {
    expect(cleanLaunchCopy(GOOD_AI, FALLBACK)).toEqual({ copy: GOOD_AI, usedAi: true })
  })

  it('replaces only the lines that fail, field by field', () => {
    const { copy, usedAi } = cleanLaunchCopy({ ...GOOD_AI, kicker: 'Since 2012', body: 'x'.repeat(400) }, FALLBACK)
    expect(copy.kicker).toBe(FALLBACK.kicker)
    expect(copy.body).toBe(FALLBACK.body)
    expect(copy.headline).toBe(GOOD_AI.headline)
    expect(usedAi).toBe(true)
  })

  it('needs three honest highlights, else keeps the store-type ones', () => {
    const { copy } = cleanLaunchCopy({ ...GOOD_AI, highlights: ['Grilled liempo', 'Rated 5 stars', 42] }, FALLBACK)
    expect(copy.highlights).toEqual(FALLBACK.highlights)
  })

  it('falls back entirely for a missing or malformed answer', () => {
    expect(cleanLaunchCopy(null, FALLBACK)).toEqual({ copy: FALLBACK, usedAi: false })
    expect(cleanLaunchCopy(['headline'], FALLBACK)).toEqual({ copy: FALLBACK, usedAi: false })
    expect(cleanLaunchCopy({ headline: 'Hi' }, FALLBACK).usedAi).toBe(false)
  })
})
