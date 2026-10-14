import { isLikelyBot, parseVisitRequest, shouldCountVisit, visitStorageKey } from '@/lib/storefront/visit-request'

describe('parseVisitRequest', () => {
  test('accepts a store slug', () => {
    expect(parseVisitRequest({ slug: 'juans-kitchen' })).toEqual({ slug: 'juans-kitchen' })
  })

  test.each([
    [null],
    ['juans-kitchen'],
    [{}],
    [{ slug: '' }],
    [{ slug: 'Juans Kitchen' }],
    [{ slug: '../admin' }],
    [{ slug: 'a'.repeat(64) }],
    [{ slug: 42 }],
  ])('refuses %p', (body) => {
    expect(parseVisitRequest(body)).toBeNull()
  })
})

describe('isLikelyBot', () => {
  test.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (Linux) HeadlessChrome/120.0 Safari/537.36',
    'curl/8.4.0',
    '',
  ])('treats %p as a bot', (ua) => {
    expect(isLikelyBot(ua)).toBe(true)
  })

  test('treats a phone browser as a person', () => {
    expect(isLikelyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false)
  })

  test('treats a missing user agent as a bot', () => {
    expect(isLikelyBot(null)).toBe(true)
  })
})

describe('shouldCountVisit', () => {
  const visitor = { isOwnerViewing: false, isFramed: false, hasCountedThisSession: false }

  test('counts the first open of a session', () => {
    expect(shouldCountVisit(visitor)).toBe(true)
  })

  test('does not count a second open in the same session', () => {
    expect(shouldCountVisit({ ...visitor, hasCountedThisSession: true })).toBe(false)
  })

  test("does not count the owner looking at their own store", () => {
    expect(shouldCountVisit({ ...visitor, isOwnerViewing: true })).toBe(false)
  })

  test('does not count previews drawn in a frame (Studio, set-up page)', () => {
    expect(shouldCountVisit({ ...visitor, isFramed: true })).toBe(false)
  })
})

test('session key is per store', () => {
  expect(visitStorageKey('a')).not.toEqual(visitStorageKey('b'))
})
